/**
 * Manages ONE long-lived PySpark worker process (spark-engine/worker.py).
 * The Spark session and cleaned DataFrame stay in memory, so a filtered request only costs
 * a few Spark SQL queries instead of a new JVM + Spark session.
 *
 * Protocol: one JSON object per line on stdin/stdout (see worker.py).
 */
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const config = require('../config');
const { AppError } = require('../errors');

let child = null;
let readyPromise = null;
let nextId = 1;
const pending = new Map(); // id -> { resolve, reject, timer }
const stderrTail = [];

function failAll(error) {
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(error);
  }
  pending.clear();
}

function start() {
  if (readyPromise) return readyPromise;

  readyPromise = new Promise((resolve, reject) => {
    // Forward JAVA_HOME so the Spark worker finds the JDK when set via .env.
    const sparkEnv = { ...process.env, PYTHONUNBUFFERED: '1' };
    if (config.javaHome) sparkEnv.JAVA_HOME = config.javaHome;
    const proc = spawn(config.pythonBin, [path.join(config.engineDir, 'worker.py'), '--input', config.inputCsv], {
      cwd: config.engineDir,
      env: sparkEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child = proc;
    let ready = false;

    const startTimer = setTimeout(() => {
      reject(new AppError(504, 'WORKER_TIMEOUT', 'The Spark worker did not start in time.'));
      stop();
    }, config.workerStartTimeoutMs);

    proc.stderr.on('data', (buf) => {
      buf.toString().split(/\r?\n/).filter(Boolean).forEach((l) => {
        stderrTail.push(l);
        if (stderrTail.length > 40) stderrTail.shift();
        if (config.debugSpark) console.error(`[spark-worker] ${l}`);
      });
    });

    readline.createInterface({ input: proc.stdout }).on('line', (line) => {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.type === 'ready') {
        ready = true;
        clearTimeout(startTimer);
        return resolve();
      }
      if (msg.type === 'fatal') {
        clearTimeout(startTimer);
        return reject(new AppError(500, 'WORKER_FAILED', `Spark worker failed to start: ${msg.error}`));
      }
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.data);
      else p.reject(new AppError(500, 'SPARK_ERROR', msg.error || 'Spark query failed.'));
    });

    proc.on('error', (err) => {
      clearTimeout(startTimer);
      const e = new AppError(500, 'WORKER_FAILED',
        `Could not start Python (${config.pythonBin}): ${err.message}. Set PYTHON_BIN or create the .venv (see README).`);
      if (!ready) reject(e);
      failAll(e);
    });

    proc.on('close', (code) => {
      clearTimeout(startTimer);
      const hint = stderrTail.filter((l) => !l.includes('JAVA_TOOL_OPTIONS')).slice(-4).join(' | ');
      const e = new AppError(500, 'WORKER_EXITED', `Spark worker exited (code ${code}). ${hint}`);
      if (!ready) reject(e);
      failAll(e);
      if (child === proc) { child = null; readyPromise = null; }
    });
  });

  // if start-up fails, allow a later request to retry
  readyPromise.catch(() => { readyPromise = null; });
  return readyPromise;
}

async function request(filters) {
  await start();
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new AppError(504, 'SPARK_TIMEOUT', 'The Spark query timed out.'));
    }, config.requestTimeoutMs);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ id, type: 'analytics', filters })}\n`);
  });
}

function stop() {
  if (!child) { readyPromise = null; return; }
  try { child.stdin.write(`${JSON.stringify({ type: 'shutdown' })}\n`); } catch { /* already closed */ }
  const proc = child;
  setTimeout(() => { try { proc.kill(); } catch { /* ignore */ } }, 3000).unref();
  child = null;
  readyPromise = null;
}

module.exports = { start, request, stop, isRunning: () => child !== null };

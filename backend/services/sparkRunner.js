const { spawn } = require('child_process');
const path = require('path');
const config = require('../config');
const store = require('./outputStore');
const { AppError } = require('../errors');

let current = null; // { child, startedAt }
let lastError = null;

/** Current state of the Spark batch job (idle | running | succeeded | failed). */
function getStatus() {
  const file = store.readJson('status.json');
  if (current) return { ...(file || {}), state: 'running', startedAt: current.startedAt };
  if (!file) return { state: 'idle', message: 'The Spark job has not been run yet.' };
  if (file.state === 'running') {
    // status file says running but no process of ours exists: it crashed or was killed
    return { ...file, state: 'failed', error: 'The previous Spark job did not finish.' };
  }
  return file;
}

/**
 * Start the PySpark batch job as a controlled subprocess.
 * Arguments are passed as an array (never through a shell), so nothing can be injected.
 */
function runBatch(onFinished) {
  if (current) throw new AppError(409, 'JOB_RUNNING', 'A Spark job is already running.');

  const script = path.join(config.engineDir, 'analytics.py');
  const args = [script, 'batch', '--input', config.inputCsv, '--output', config.outputDir];
  const startedAt = new Date().toISOString();
  // Forward JAVA_HOME explicitly so Spark finds the JDK even when it was only set
  // via .env (envLoader has already placed it in process.env).
  const sparkEnv = { ...process.env, PYTHONUNBUFFERED: '1' };
  if (config.javaHome) sparkEnv.JAVA_HOME = config.javaHome;
  const child = spawn(config.pythonBin, args, {
    cwd: config.engineDir,
    env: sparkEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  current = { child, startedAt };
  lastError = null;

  const tail = [];
  const keep = (buf) => {
    buf.toString().split(/\r?\n/).filter(Boolean).forEach((l) => {
      tail.push(l);
      if (tail.length > 40) tail.shift();
      if (config.debugSpark) console.error(`[spark-batch] ${l}`);
    });
  };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);

  let done = false;
  const finish = (ok, message) => {
    if (done) return;
    done = true;
    current = null;
    if (!ok) {
      lastError = message;
      // Python normally writes status.json itself; cover crashes before it could (missing python, bad imports).
      const file = store.readJson('status.json');
      if (!file || file.state === 'running') {
        store.writeStatus({ state: 'failed', finished_at: new Date().toISOString(), error: message });
      }
    }
    if (onFinished) onFinished(ok);
  };

  child.on('error', (err) => finish(false,
    `Could not start Python (${config.pythonBin}): ${err.message}. Set PYTHON_BIN or create the .venv (see README).`));
  child.on('close', (code) => {
    if (code === 0) return finish(true);
    const hint = tail.filter((l) => !l.includes('JAVA_TOOL_OPTIONS')).slice(-6).join(' | ');
    finish(false, `Spark job exited with code ${code}. ${hint}`);
  });

  return { state: 'running', startedAt };
}

module.exports = { runBatch, getStatus, isRunning: () => current !== null, getLastError: () => lastError };

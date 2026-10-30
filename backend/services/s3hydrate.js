const { spawn } = require('child_process');
const path = require('path');
const config = require('../config');

function runPython(args, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.pythonBin, args, {
      cwd: config.engineDir,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      reject(new Error(`Timed out after ${timeoutMs}ms: ${args.join(' ')}`));
    }, timeoutMs);
    child.stdout.on('data', (b) => { stdout += b.toString(); });
    child.stderr.on('data', (b) => { stderr += b.toString(); });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error((stderr || stdout || `exit ${code}`).trim()));
    });
  });
}

function s3Configured() {
  return Boolean(config.s3.bucket && (config.dataSource === 's3' || config.s3.writesEnabled || config.s3.hydrateOnBoot));
}

async function hydrateFromS3() {
  if (!config.s3.bucket) return { skipped: true, reason: 'S3_BUCKET not set' };
  const script = path.join(config.engineDir, 's3_cli.py');
  const { stdout } = await runPython([script, 'hydrate', '--output', config.outputDir]);
  let parsed = {};
  try { parsed = JSON.parse(stdout.trim().split('\n').pop()); } catch { /* non-JSON */ }
  return { skipped: false, downloaded: parsed.downloaded || [], raw: stdout.trim() };
}

async function uploadResultsToS3() {
  if (!config.s3.writesEnabled || !config.s3.bucket) return { skipped: true };
  const script = path.join(config.engineDir, 's3_cli.py');
  const { stdout } = await runPython([script, 'upload-results', '--output', config.outputDir]);
  return { skipped: false, raw: stdout.trim() };
}

module.exports = { hydrateFromS3, uploadResultsToS3, s3Configured, runPython };

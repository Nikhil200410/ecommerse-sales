const fs = require('fs');
const path = require('path');
const { loadProjectEnv } = require('./envLoader');

const projectRoot = path.resolve(__dirname, '..');
loadProjectEnv(projectRoot);

const engineDir = path.resolve(process.env.SPARK_ENGINE_DIR || path.join(projectRoot, 'spark-engine'));

/** Prefer the project's virtualenv, then PYTHON_BIN, then the system python. */
function resolvePython() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const venv = process.platform === 'win32'
    ? path.join(projectRoot, '.venv', 'Scripts', 'python.exe')
    : path.join(projectRoot, '.venv', 'bin', 'python');
  if (fs.existsSync(venv)) return venv;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function isRemote(uri) {
  return typeof uri === 'string' && /^s3a?:\/\//i.test(uri.trim());
}

function toS3a(uri) {
  return uri.trim().replace(/^s3:\/\//i, 's3a://');
}

function dataSource() {
  const explicit = (process.env.DATA_SOURCE || '').trim().toLowerCase();
  if (explicit === 's3' || explicit === 'local') return explicit;
  if (isRemote(process.env.ANALYTICS_INPUT || '')) return 's3';
  return 'local';
}

function resolveInput() {
  const raw = (process.env.ANALYTICS_INPUT || '').trim();
  const source = dataSource();
  if (raw && isRemote(raw)) return toS3a(raw);
  if (source === 's3') {
    const bucket = (process.env.S3_BUCKET || '').trim();
    const key = (process.env.S3_INPUT_KEY || 'raw/orders.csv').replace(/^\/+/, '');
    if (!bucket) {
      throw new Error('DATA_SOURCE=s3 requires S3_BUCKET (bucket name only).');
    }
    return `s3a://${bucket}/${key}`;
  }
  return path.resolve(raw || path.join(engineDir, 'data', 'orders.csv'));
}

const source = dataSource();
let inputCsv;
let inputCsvError = null;
try {
  inputCsv = resolveInput();
} catch (err) {
  inputCsvError = err.message;
  inputCsv = path.join(engineDir, 'data', 'orders.csv');
}

const s3WritesFlag = (process.env.S3_WRITE_RESULTS || '').trim().toLowerCase();
const s3WritesEnabled = s3WritesFlag
  ? ['1', 'true', 'yes', 'on'].includes(s3WritesFlag)
  : source === 's3';

module.exports = {
  port: Number(process.env.PORT) || 4000,
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',').map((s) => s.trim()).filter(Boolean),
  engineDir,
  projectRoot,
  outputDir: path.resolve(process.env.OUTPUT_DIR || path.join(projectRoot, 'output')),
  inputCsv,
  inputCsvError,
  dataSource: source,
  s3: {
    bucket: (process.env.S3_BUCKET || '').trim() || null,
    region: (process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || process.env.S3_REGION || '').trim() || null,
    inputKey: (process.env.S3_INPUT_KEY || 'raw/orders.csv').replace(/^\/+/, ''),
    outputPrefix: (process.env.S3_OUTPUT_PREFIX || 'processed').replace(/^\/+|\/+$/g, ''),
    writesEnabled: s3WritesEnabled,
    hydrateOnBoot: process.env.S3_HYDRATE_ON_BOOT !== 'false' && source === 's3',
  },
  pythonBin: resolvePython(),
  /** JAVA_HOME from .env (if set) — forwarded to every Spark subprocess explicitly. */
  javaHome: (process.env.JAVA_HOME || '').trim() || null,
  workerStartTimeoutMs: Number(process.env.WORKER_START_TIMEOUT_MS) || 180000,
  requestTimeoutMs: Number(process.env.WORKER_REQUEST_TIMEOUT_MS) || 120000,
  prewarmWorker: process.env.PREWARM_WORKER !== 'false',
  debugSpark: process.env.DEBUG_SPARK === 'true',
};

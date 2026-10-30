const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

before(() => {
  process.env.DATA_SOURCE = 'local';
  delete process.env.S3_BUCKET;
  process.env.ANALYTICS_INPUT = path.resolve(__dirname, '..', '..', 'spark-engine', 'tests', 'test_orders.csv');
});

test('config resolves a local CSV without contacting AWS', () => {
  delete require.cache[require.resolve('../config')];
  delete require.cache[require.resolve('../envLoader')];
  const config = require('../config');
  assert.equal(config.dataSource, 'local');
  assert.match(config.inputCsv.replace(/\\/g, '/'), /test_orders\.csv$/);
  assert.equal(config.s3.writesEnabled, false);
});

test('health payload does not include credentials or bucket names', async () => {
  process.env.OUTPUT_DIR = process.env.OUTPUT_DIR || require('os').tmpdir();
  delete require.cache[require.resolve('../app')];
  delete require.cache[require.resolve('../config')];
  const app = require('../app');
  const server = app.listen(0);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/api/health`);
  const body = await res.json();
  server.close();
  assert.equal(body.success, true);
  assert.equal(body.data.status, 'ok');
  assert.equal(body.data.data_source, 'local');
  const dumped = JSON.stringify(body);
  assert.equal(dumped.includes('AWS_SECRET'), false);
  assert.equal(dumped.includes('access_key'), false);
});

test('Python S3 config validation fails fast without a bucket', () => {
  const engine = path.resolve(__dirname, '..', '..', 'spark-engine');
  const python = process.env.PYTHON_BIN
    || (process.platform === 'win32'
      ? path.resolve(__dirname, '..', '..', '.venv', 'Scripts', 'python.exe')
      : path.resolve(__dirname, '..', '..', '.venv', 'bin', 'python'));
  const result = spawnSync(python, ['-c',
    "import os,sys; sys.path.insert(0,'.'); os.environ['DATA_SOURCE']='s3'; os.environ.pop('S3_BUCKET', None); from jobs.storage import resolve_input, StorageConfigError;\n"
    + "try:\n resolve_input()\nexcept Exception as e:\n print(type(e).__name__); raise SystemExit(0)\nprint('NO_ERROR'); raise SystemExit(1)",
  ], { cwd: engine, encoding: 'utf8' });
  if (result.error && result.error.code === 'ENOENT') {
    return; // venv not created in this environment
  }
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /StorageConfigError/);
});

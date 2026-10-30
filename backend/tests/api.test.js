/**
 * End-to-end API test. It really runs the PySpark batch job on the small hand-verified
 * dataset (spark-engine/tests/test_orders.csv) into a temp folder, then calls the API.
 * Needs Java + the Python venv with pyspark (see README). Takes roughly 1-3 minutes.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ecom-api-test-'));
process.env.OUTPUT_DIR = tmp;
process.env.DATA_SOURCE = 'local';
process.env.ANALYTICS_INPUT = path.resolve(__dirname, '..', '..', 'spark-engine', 'tests', 'test_orders.csv');

const app = require('../app');
const worker = require('../services/sparkWorker');

let server;
let base;

const get = async (p) => {
  const res = await fetch(`${base}${p}`);
  const type = res.headers.get('content-type') || '';
  return { res, body: type.includes('json') ? await res.json() : await res.text() };
};

before(async () => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => {
  worker.stop();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('GET /health is ok and does not expose credentials', async () => {
  const { res, body } = await get('/health');
  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.status, 'ok');
  assert.equal(body.data.data_source, 'local');
  const dumped = JSON.stringify(body);
  assert.equal(dumped.includes('AWS_SECRET'), false);
  assert.equal(dumped.includes('accessKey'), false);
});

test('before the Spark job runs, analytics endpoints answer 503 NOT_PROCESSED', async () => {
  const { res, body } = await get('/overview');
  assert.equal(res.status, 503);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'NOT_PROCESSED');
});

test('POST /jobs/run starts the Spark batch job and it succeeds', async () => {
  const start = await fetch(`${base}/jobs/run`, { method: 'POST' });
  assert.equal(start.status, 202);

  const deadline = Date.now() + 5 * 60 * 1000;
  let state = 'running';
  while (Date.now() < deadline && state === 'running') {
    await new Promise((r) => setTimeout(r, 2000));
    state = (await get('/status')).body.data.job.state;
  }
  assert.equal(state, 'succeeded');
});

test('GET /overview returns the hand-verified KPIs', async () => {
  const { res, body } = await get('/overview');
  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.meta.source, 'precomputed');
  const o = body.data;
  assert.equal(o.gross_revenue, 28200);
  assert.equal(o.discount_amount, 3000);
  assert.equal(o.net_revenue, 25200);
  assert.equal(o.valid_orders, 6);
  assert.equal(o.units_sold, 22);
  assert.equal(o.purchasing_customers, 4);
  assert.equal(o.average_order_value, 4200);
});

test('GET /data-quality reports duplicates, rejections and status', async () => {
  const { body } = await get('/data-quality');
  assert.equal(body.data.input_records, 16);
  assert.equal(body.data.duplicate_records, 1);
  assert.equal(body.data.rejected_records, 6);
  assert.equal(body.data.valid_records, 9);
  assert.equal(body.data.status, 'succeeded');
});

test('other sections have consistent structure', async () => {
  const products = (await get('/products')).body.data;
  assert.equal(products.top_by_revenue[0].product_name, 'Phone');
  assert.equal(products.top_by_quantity[0].product_name, 'Book');
  assert.equal((await get('/trends')).body.data.monthly.length, 4);
  assert.equal((await get('/geography')).body.data.by_city.length, 4);
  assert.equal((await get('/payments')).body.data.length, 3);
  assert.equal((await get('/customers')).body.data.top_spenders[0].customer_id, 'C1');
  const filters = (await get('/filters')).body.data;
  assert.deepEqual(filters.categories, ['Accessories', 'Books', 'Electronics', 'Fashion']);
});

test('filtered requests are answered by the Spark worker', async () => {
  const cat = await get('/overview?category=Electronics');
  assert.equal(cat.res.status, 200);
  assert.match(cat.body.meta.source, /spark-worker/);
  assert.equal(cat.body.data.net_revenue, 19000);
  assert.equal(cat.body.data.valid_orders, 2);

  const feb = await get('/overview?start=2025-02-01&end=2025-02-28');
  assert.equal(feb.body.data.net_revenue, 11800);

  const empty = await get('/overview?start=2030-01-01');
  assert.equal(empty.body.data.has_data, false);
  assert.equal(empty.body.data.net_revenue, 0);
});

test('invalid filters are rejected with 400', async () => {
  assert.equal((await get('/overview?start=2025-13-40')).res.status, 400);
  assert.equal((await get('/overview?start=2025-03-01&end=2025-01-01')).res.status, 400);
  const unknown = await get('/overview?category=Nope');
  assert.equal(unknown.res.status, 400);
  assert.equal(unknown.body.error.code, 'INVALID_FILTER');
});

test('CSV export returns Spark results as a download', async () => {
  const { res, body } = await get('/export/top_products_by_revenue');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.match(res.headers.get('content-disposition'), /top_products_by_revenue\.csv/);
  const lines = body.replace(/^﻿/, '').trim().split(/\r?\n/);
  assert.equal(lines[0], 'Product ID,Product,Category,Net revenue (INR),Units sold');
  assert.equal(lines[1], 'P1,Phone,Electronics,19000,2');

  const filtered = await get('/export/category_revenue?category=Books');
  assert.equal(filtered.body.replace(/^﻿/, '').trim().split(/\r?\n/)[1], 'Books,1600,10,1');

  assert.equal((await get('/export/not_a_dataset')).res.status, 404);
});

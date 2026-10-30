const analytics = require('../services/analyticsService');
const runner = require('../services/sparkRunner');
const { parseFilters } = require('../services/filters');
const { DATASETS, toCsv } = require('../services/csvExport');
const store = require('../services/outputStore');
const { AppError } = require('../errors');

/** Consistent envelope: { success, data, meta }. */
const ok = (res, data, meta = {}) => res.json({ success: true, data, meta });

/** Build a handler that returns one section of the (possibly filtered) Spark analytics. */
function section(select) {
  return async (req, res) => {
    const filters = parseFilters(req.query);
    const { result, source } = await analytics.getAnalytics(filters);
    ok(res, select(result), { filters: result.filters || filters, generated_at: result.generated_at, source });
  };
}

const overview = section((r) => r.overview);
const trends = section((r) => r.trends);
const products = section((r) => r.products);
const customers = section((r) => r.customers);
const geography = section((r) => r.geography);
const payments = section((r) => r.payments);

async function dataQuality(req, res) {
  const dq = analytics.getDataQuality();
  ok(res, dq, { source: 'precomputed', note: 'Data quality always describes the whole input file; filters do not apply.' });
}

async function filterOptions(req, res) {
  ok(res, analytics.getMeta(), { source: 'precomputed' });
}

async function status(req, res) {
  const job = runner.getStatus();
  ok(res, { job, processed: store.readJson('analytics.json') !== null });
}

async function runJob(req, res) {
  const info = analytics.startBatch();
  res.status(202).json({ success: true, data: info, meta: {} });
}

async function exportCsv(req, res) {
  const name = req.params.dataset;
  if (!Object.prototype.hasOwnProperty.call(DATASETS, name)) {
    throw new AppError(404, 'UNKNOWN_DATASET', `Unknown export "${name}". Available: ${Object.keys(DATASETS).join(', ')}`);
  }
  const filters = parseFilters(req.query);
  const { result } = await analytics.getAnalytics(filters);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
  res.send(toCsv(name, result));
}

module.exports = { overview, trends, products, customers, geography, payments, dataQuality, filterOptions, status, runJob, exportCsv };

const store = require('./outputStore');
const worker = require('./sparkWorker');
const runner = require('./sparkRunner');
const { AppError } = require('../errors');

const MAX_CACHE = 60;
const cache = new Map();    // filter key -> result
const inflight = new Map(); // filter key -> Promise (several endpoints share one Spark computation)

const hasFilters = (f) => Boolean(f.start || f.end || f.category || f.city);
const keyOf = (f) => JSON.stringify([f.start || null, f.end || null, f.category || null, f.city || null]);

function requireProcessed() {
  const data = store.readJson('analytics.json');
  if (!data) {
    throw new AppError(503, 'NOT_PROCESSED',
      'No Spark results yet. Run the Spark job (POST /api/jobs/run or the dashboard button) first.');
  }
  return data;
}

/**
 * Unfiltered -> the precomputed JSON written by the Spark batch job (instant).
 * Filtered   -> computed by the persistent Spark worker, then cached per filter combination.
 */
async function getAnalytics(filters) {
  const base = requireProcessed();
  if (!hasFilters(filters)) return { result: base, source: 'precomputed' };

  const key = keyOf(filters);
  if (cache.has(key)) return { result: cache.get(key), source: 'spark-worker (cached)' };
  if (!inflight.has(key)) {
    const job = worker.request(filters)
      .then((result) => {
        result.generated_at = new Date().toISOString();
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
        cache.set(key, result);
        return result;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return { result: await inflight.get(key), source: 'spark-worker' };
}

function getDataQuality() {
  const dq = store.readJson('data_quality.json');
  if (!dq) throw new AppError(503, 'NOT_PROCESSED', 'No Spark results yet. Run the Spark job first.');
  return dq;
}

function getMeta() {
  const meta = store.readJson('meta.json');
  if (!meta) throw new AppError(503, 'NOT_PROCESSED', 'No Spark results yet. Run the Spark job first.');
  return meta;
}

function invalidate() {
  cache.clear();
  worker.stop();
}

/** Start the batch job; old cached results and the old worker are discarded. */
function startBatch() {
  worker.stop(); // free memory and make sure no stale session survives a re-run
  const info = runner.runBatch(() => invalidate());
  cache.clear();
  return info;
}

module.exports = { getAnalytics, getDataQuality, getMeta, startBatch, invalidate };

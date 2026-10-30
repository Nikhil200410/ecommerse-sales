const { AppError } = require('../errors');
const store = require('./outputStore');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(text) {
  if (!DATE_RE.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

const clean = (v) => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' || t.toLowerCase() === 'all' ? null : t;
};

/** Validate ?start=&end=&category=&city= query parameters. */
function parseFilters(query) {
  const f = { start: clean(query.start), end: clean(query.end), category: clean(query.category), city: clean(query.city) };

  for (const key of ['start', 'end']) {
    if (f[key] && !isRealDate(f[key])) {
      throw new AppError(400, 'INVALID_FILTER', `"${key}" must be a real date in YYYY-MM-DD format.`);
    }
  }
  if (f.start && f.end && f.start > f.end) {
    throw new AppError(400, 'INVALID_FILTER', '"start" must not be after "end".');
  }
  const meta = store.readJson('meta.json');
  if (meta) {
    if (f.category && !meta.categories.includes(f.category)) {
      throw new AppError(400, 'INVALID_FILTER', `Unknown category "${f.category}".`);
    }
    if (f.city && !meta.cities.includes(f.city)) {
      throw new AppError(400, 'INVALID_FILTER', `Unknown city "${f.city}".`);
    }
  }
  return f;
}

module.exports = { parseFilters };

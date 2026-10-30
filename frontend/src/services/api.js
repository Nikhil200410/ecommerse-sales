export class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

let analyticsPromise;

async function readJson(file) {
  let response;
  try {
    response = await fetch(`/data/${file}`);
  } catch {
    throw new ApiError('Cannot load the published dashboard data.', 'NETWORK', 0);
  }
  if (!response.ok) {
    throw new ApiError(`Could not load ${file} (${response.status}).`, 'HTTP_ERROR', response.status);
  }
  return response.json();
}

function analytics() {
  if (!analyticsPromise) {
    analyticsPromise = readJson('analytics.json').catch((error) => {
      analyticsPromise = null;
      throw error;
    });
  }
  return analyticsPromise;
}

const section = (select) => async () => ({
  success: true,
  data: select(await analytics()),
  meta: { source: 'static snapshot' },
});

export const api = {
  status: async () => ({
    success: true,
    data: { job: { state: 'succeeded' }, processed: Boolean(await analytics()) },
    meta: {},
  }),
  filterOptions: async () => ({
    success: true,
    data: await readJson('meta.json'),
    meta: { source: 'static snapshot' },
  }),
  overview: section((result) => result.overview),
  trends: section((result) => result.trends),
  products: section((result) => result.products),
  customers: section((result) => result.customers),
  geography: section((result) => result.geography),
  payments: section((result) => result.payments),
  dataQuality: async () => ({
    success: true,
    data: await readJson('data_quality.json'),
    meta: { source: 'static snapshot' },
  }),
};

export const exportUrl = (dataset) => `/data/exports/${encodeURIComponent(dataset)}.csv`;

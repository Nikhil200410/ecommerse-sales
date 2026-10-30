const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function query(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  const s = params.toString();
  return s ? `?${s}` : '';
}

async function request(path, options) {
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, options);
  } catch {
    throw new ApiError('Cannot reach the API. Is the backend running, and is VITE_API_BASE_URL set if you are not using the Vite proxy?', 'NETWORK', 0);
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error */
  }
  if (!res.ok || !body?.success) {
    throw new ApiError(body?.error?.message || `Request failed (${res.status})`, body?.error?.code || 'HTTP_ERROR', res.status);
  }
  return body;
}

const section = (name) => (filters) => request(`/${name}${query(filters)}`);

export const api = {
  status: () => request('/status'),
  runJob: () => request('/jobs/run', { method: 'POST' }),
  filterOptions: () => request('/filters'),
  overview: section('overview'),
  trends: section('trends'),
  products: section('products'),
  customers: section('customers'),
  geography: section('geography'),
  payments: section('payments'),
  dataQuality: () => request('/data-quality'),
};

export const exportUrl = (dataset, filters) => `${BASE}/api/export/${dataset}${query(filters)}`;

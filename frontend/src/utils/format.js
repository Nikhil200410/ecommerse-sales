const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrExact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const num = new Intl.NumberFormat('en-IN');

export const formatINR = (v) => inr.format(v ?? 0);
export const formatINRExact = (v) => inrExact.format(v ?? 0);
export const formatNumber = (v) => num.format(v ?? 0);
export const formatPct = (v) => `${(v ?? 0).toFixed(1)}%`;

/** Compact INR using the Indian numbering units: K, L (lakh), Cr (crore). */
export function formatINRCompact(v) {
  const n = Math.abs(v ?? 0);
  const sign = v < 0 ? '-' : '';
  const trim = (x) => String(Number(x.toFixed(2)));
  if (n >= 1e7) return `${sign}₹${trim(n / 1e7)} Cr`;
  if (n >= 1e5) return `${sign}₹${trim(n / 1e5)} L`;
  if (n >= 1e3) return `${sign}₹${trim(n / 1e3)} K`;
  return `${sign}₹${Math.round(n)}`;
}

export const compactNumber = (v) => {
  const n = Math.abs(v ?? 0);
  if (n >= 1e7) return `${(n / 1e7).toFixed(1)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)} L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} K`;
  return String(n);
};

export const shortDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
};

export const monthLabel = (ym) => {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });
};

export const truncate = (s, n = 22) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);

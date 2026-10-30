/**
 * CSV export of Spark-produced result tables. This only FORMATS rows that Spark already
 * computed; no analytics are calculated here.
 */
const col = (key, label) => ({ key, label });

const DATASETS = {
  daily_trend: { rows: (r) => r.trends.daily, columns: [col('date', 'Date'), col('net_revenue', 'Net revenue (INR)'), col('orders', 'Orders'), col('units', 'Units')] },
  monthly_trend: { rows: (r) => r.trends.monthly, columns: [col('month', 'Month'), col('net_revenue', 'Net revenue (INR)'), col('orders', 'Orders'), col('units', 'Units')] },
  top_products_by_revenue: { rows: (r) => r.products.top_by_revenue, columns: [col('product_id', 'Product ID'), col('product_name', 'Product'), col('category', 'Category'), col('net_revenue', 'Net revenue (INR)'), col('units_sold', 'Units sold')] },
  top_products_by_quantity: { rows: (r) => r.products.top_by_quantity, columns: [col('product_id', 'Product ID'), col('product_name', 'Product'), col('category', 'Category'), col('units_sold', 'Units sold'), col('net_revenue', 'Net revenue (INR)')] },
  category_revenue: { rows: (r) => r.products.by_category, columns: [col('category', 'Category'), col('net_revenue', 'Net revenue (INR)'), col('units_sold', 'Units sold'), col('orders', 'Orders')] },
  low_performing_products: { rows: (r) => r.products.low_performers, columns: [col('product_id', 'Product ID'), col('product_name', 'Product'), col('category', 'Category'), col('net_revenue', 'Net revenue (INR)'), col('units_sold', 'Units sold')] },
  top_customers: { rows: (r) => r.customers.top_spenders, columns: [col('customer_id', 'Customer ID'), col('orders', 'Orders'), col('units', 'Units'), col('net_revenue', 'Net revenue (INR)')] },
  repeat_vs_onetime: { rows: (r) => r.customers.repeat_vs_onetime, columns: [col('buyer_type', 'Buyer type'), col('customers', 'Customers'), col('net_revenue', 'Net revenue (INR)')] },
  rfm_segments: { rows: (r) => r.customers.rfm_segments, columns: [col('segment', 'Segment'), col('customers', 'Customers'), col('net_revenue', 'Net revenue (INR)'), col('avg_recency_days', 'Avg recency (days)'), col('avg_orders', 'Avg orders')] },
  city_revenue: { rows: (r) => r.geography.by_city, columns: [col('city', 'City'), col('state', 'State'), col('net_revenue', 'Net revenue (INR)'), col('orders', 'Orders')] },
  state_revenue: { rows: (r) => r.geography.by_state, columns: [col('state', 'State'), col('net_revenue', 'Net revenue (INR)'), col('orders', 'Orders')] },
  payment_methods: { rows: (r) => r.payments, columns: [col('payment_method', 'Payment method'), col('orders', 'Orders'), col('net_revenue', 'Net revenue (INR)'), col('revenue_share_pct', 'Revenue share (%)')] },
};

function cell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Neutralise spreadsheet formula injection for text cells
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(datasetName, result) {
  const spec = DATASETS[datasetName];
  const lines = [spec.columns.map((c) => cell(c.label)).join(',')];
  for (const row of spec.rows(result)) lines.push(spec.columns.map((c) => cell(row[c.key])).join(','));
  return `﻿${lines.join('\r\n')}\r\n`; // BOM so Excel reads UTF-8 correctly
}

module.exports = { DATASETS, toCsv };

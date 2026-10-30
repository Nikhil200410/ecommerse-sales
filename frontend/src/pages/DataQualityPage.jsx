import { Card, DataTable, KpiCard } from '../components/Card';
import { HBarChart } from '../components/Charts';
import { Async } from '../components/States';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import { formatNumber } from '../utils/format';

const REASON_LABELS = {
  missing_key: 'Missing order / customer / product ID',
  invalid_date: 'Invalid or out-of-range date',
  invalid_quantity: 'Invalid quantity',
  invalid_unit_price: 'Invalid unit price',
  invalid_discount: 'Invalid discount (not 0–1)',
  invalid_order_status: 'Unknown order status',
};

export default function DataQualityPage() {
  const result = useApi(() => api.dataQuality(), []);
  return (
    <Async result={result}>
      {(q) => {
        const reasons = Object.entries(q.rejected_by_reason).map(([k, v]) => ({ reason: REASON_LABELS[k] || k, count: v }));
        const statuses = Object.entries(q.status_breakdown).map(([status, count]) => ({ status, count }));
        return (
          <>
            <div className="kpis">
              <KpiCard label="Total input records" value={formatNumber(q.input_records)} sub={q.source_file} />
              <KpiCard label="Valid records" value={formatNumber(q.valid_records)} sub={`${formatNumber(q.revenue_eligible_records)} count as sales`} />
              <KpiCard label="Rejected records" value={formatNumber(q.rejected_records)} sub="Failed validation" />
              <KpiCard label="Duplicate records" value={formatNumber(q.duplicate_records)} sub="Exact repeats removed" />
              <div className="card kpi">
                <div className="label">Processing status</div>
                <div className="value" style={{ fontSize: 18 }}>
                  <span className={`pill ${q.status === 'succeeded' ? 'ok' : 'bad'}`}>{q.status === 'succeeded' ? '✓ Succeeded' : q.status}</span>
                </div>
                <div className="sub">{q.duration_seconds}s on Spark {q.spark_version}</div>
              </div>
            </div>
            <div className="grid two">
              <Card title="Why records were rejected" subtitle="First failing validation rule per record">
                <HBarChart data={reasons} labelKey="reason" valueKey="count" valueLabel="Records" valueKind="count" labelWidth={220} />
              </Card>
              <Card title="Valid records by order status" subtitle="Only Delivered and Shipped lines count towards revenue">
                <DataTable
                  rowKey="status"
                  rows={statuses}
                  columns={[
                    { key: 'status', label: 'Status' },
                    { key: 'count', label: 'Records', num: true, render: formatNumber },
                    { key: 'status2', label: 'Treatment', render: (_, r) => (['Delivered', 'Shipped'].includes(r.status) ? 'Counted as revenue' : 'Excluded from revenue') },
                  ]}
                />
                <p style={{ color: 'var(--text-3)', fontSize: 12, marginBottom: 0 }}>
                  Check: {formatNumber(q.input_records)} input = {formatNumber(q.duplicate_records)} duplicates + {formatNumber(q.rejected_records)} rejected + {formatNumber(q.valid_records)} valid
                  {q.balance_check_ok ? ' ✓' : ' ✗'}. Processed {new Date(q.processed_at).toLocaleString('en-IN')}.
                </p>
                <p style={{ marginTop: 12 }}>
                  <span>Refresh this snapshot by regenerating the data locally and redeploying the dashboard.</span>
                </p>
              </Card>
            </div>
          </>
        );
      }}
    </Async>
  );
}

import { Card, DataTable, ExportButton } from '../components/Card';
import { ColumnChart } from '../components/Charts';
import { Async } from '../components/States';
import { useFilteredApi } from '../hooks/useFilteredApi';
import { api } from '../services/api';
import { formatINR, formatNumber, formatPct } from '../utils/format';

export default function PaymentsPage() {
  const result = useFilteredApi(api.payments);
  return (
    <Async result={result} isEmpty={(d) => d.length === 0}>
      {(rows) => (
        <div className="grid two">
          <Card title="Revenue by payment method" subtitle="Net revenue" actions={<ExportButton dataset="payment_methods" />}>
            <ColumnChart data={rows} labelKey="payment_method" valueKey="net_revenue" valueLabel="Net revenue" />
          </Card>
          <Card title="Orders and revenue" subtitle="Distinct valid orders per payment method">
            <DataTable
              rowKey="payment_method"
              rows={rows}
              columns={[
                { key: 'payment_method', label: 'Payment method' },
                { key: 'orders', label: 'Orders', num: true, render: formatNumber },
                { key: 'net_revenue', label: 'Net revenue', num: true, render: formatINR },
                { key: 'revenue_share_pct', label: 'Share', num: true, render: formatPct },
              ]}
            />
          </Card>
        </div>
      )}
    </Async>
  );
}

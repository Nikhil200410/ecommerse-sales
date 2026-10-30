import { Card, DataTable, ExportButton } from '../components/Card';
import { DonutChart, HBarChart } from '../components/Charts';
import { Async } from '../components/States';
import { useFilteredApi } from '../hooks/useFilteredApi';
import { api } from '../services/api';
import { formatINR, formatNumber } from '../utils/format';

export default function CustomersPage() {
  const result = useFilteredApi(api.customers);
  return (
    <Async result={result} isEmpty={(d) => d.top_spenders.length === 0}>
      {(c) => (
        <>
          <div className="grid two">
            <Card title="Top customers by spending" subtitle="Net revenue, top 10" actions={<ExportButton dataset="top_customers" />}>
              <DataTable
                rowKey="customer_id"
                rows={c.top_spenders}
                columns={[
                  { key: 'customer_id', label: 'Customer' },
                  { key: 'orders', label: 'Orders', num: true, render: formatNumber },
                  { key: 'units', label: 'Units', num: true, render: formatNumber },
                  { key: 'net_revenue', label: 'Net revenue', num: true, render: formatINR },
                ]}
              />
            </Card>
            <Card title="Repeat vs one-time buyers" subtitle="Customers with more than one order are repeat buyers" actions={<ExportButton dataset="repeat_vs_onetime" />}>
              <DonutChart data={c.repeat_vs_onetime} nameKey="buyer_type" valueKey="customers" />
              <DataTable
                rowKey="buyer_type"
                rows={c.repeat_vs_onetime}
                columns={[
                  { key: 'buyer_type', label: 'Type' },
                  { key: 'customers', label: 'Customers', num: true, render: formatNumber },
                  { key: 'net_revenue', label: 'Net revenue', num: true, render: formatINR },
                ]}
              />
            </Card>
          </div>
          <div className="grid two">
            <Card title="RFM segments" subtitle="Customers per segment" actions={<ExportButton dataset="rfm_segments" />}>
              <HBarChart data={c.rfm_segments} labelKey="segment" valueKey="customers" valueLabel="Customers" valueKind="count" labelWidth={140} />
            </Card>
            <Card title="RFM segment details" subtitle="Recency vs. the last order in the selection; frequency = distinct orders; monetary = net revenue">
              <DataTable
                rowKey="segment"
                rows={c.rfm_segments}
                columns={[
                  { key: 'segment', label: 'Segment' },
                  { key: 'customers', label: 'Customers', num: true, render: formatNumber },
                  { key: 'avg_recency_days', label: 'Avg recency (d)', num: true },
                  { key: 'avg_orders', label: 'Avg orders', num: true },
                  { key: 'net_revenue', label: 'Net revenue', num: true, render: formatINR },
                ]}
              />
            </Card>
          </div>
        </>
      )}
    </Async>
  );
}

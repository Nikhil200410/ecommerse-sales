import { Card, DataTable, ExportButton } from '../components/Card';
import { HBarChart } from '../components/Charts';
import { Async } from '../components/States';
import { useFilteredApi } from '../hooks/useFilteredApi';
import { api } from '../services/api';
import { formatINR, formatNumber } from '../utils/format';

export default function GeographyPage() {
  const result = useFilteredApi(api.geography);
  return (
    <Async result={result} isEmpty={(d) => d.by_city.length === 0}>
      {(g) => (
        <>
          <div className="grid two">
            <Card title="Revenue by state" subtitle="Net revenue, top 10 states" actions={<ExportButton dataset="state_revenue" />}>
              <HBarChart data={g.by_state.slice(0, 10)} labelKey="state" valueKey="net_revenue" valueLabel="Net revenue" labelWidth={120} />
            </Card>
            <Card title="Revenue by city" subtitle="Net revenue, top 10 cities" actions={<ExportButton dataset="city_revenue" />}>
              <HBarChart data={g.by_city.slice(0, 10)} labelKey="city" valueKey="net_revenue" valueLabel="Net revenue" labelWidth={120} />
            </Card>
          </div>
          <Card title="All cities" subtitle="Sorted by net revenue">
            <DataTable
              rowKey="city"
              rows={g.by_city}
              columns={[
                { key: 'city', label: 'City' },
                { key: 'state', label: 'State' },
                { key: 'orders', label: 'Orders', num: true, render: formatNumber },
                { key: 'net_revenue', label: 'Net revenue', num: true, render: formatINR },
              ]}
            />
          </Card>
        </>
      )}
    </Async>
  );
}

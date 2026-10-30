import { Card, DataTable, ExportButton } from '../components/Card';
import { HBarChart } from '../components/Charts';
import { Async } from '../components/States';
import { useFilteredApi } from '../hooks/useFilteredApi';
import { api } from '../services/api';
import { formatINR, formatNumber } from '../utils/format';

export default function ProductsPage() {
  const result = useFilteredApi(api.products);
  return (
    <Async result={result} isEmpty={(d) => d.by_category.length === 0}>
      {(p) => (
        <>
          <div className="grid two">
            <Card title="Top 10 products by revenue" subtitle="Net revenue" actions={<ExportButton dataset="top_products_by_revenue" />}>
              <HBarChart data={p.top_by_revenue} labelKey="product_name" valueKey="net_revenue" valueLabel="Net revenue" labelWidth={140} />
            </Card>
            <Card title="Top 10 products by quantity" subtitle="Units sold" actions={<ExportButton dataset="top_products_by_quantity" />}>
              <HBarChart data={p.top_by_quantity} labelKey="product_name" valueKey="units_sold" valueLabel="Units sold" valueKind="count" labelWidth={140} />
            </Card>
          </div>
          <div className="grid two">
            <Card title="Revenue by category" subtitle="Net revenue" actions={<ExportButton dataset="category_revenue" />}>
              <HBarChart data={p.by_category} labelKey="category" valueKey="net_revenue" valueLabel="Net revenue" labelWidth={120} />
            </Card>
            <Card title="Low-performing products" subtitle="Lowest net revenue in the selection (zero = no sales)" actions={<ExportButton dataset="low_performing_products" />}>
              <DataTable
                rowKey="product_id"
                rows={p.low_performers}
                columns={[
                  { key: 'product_name', label: 'Product' },
                  { key: 'category', label: 'Category' },
                  { key: 'units_sold', label: 'Units', num: true, render: formatNumber },
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

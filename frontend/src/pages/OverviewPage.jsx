import { useState } from 'react';
import { Card, ExportButton, KpiCard } from '../components/Card';
import { TrendChart } from '../components/Charts';
import { Async } from '../components/States';
import { useFilteredApi } from '../hooks/useFilteredApi';
import { api } from '../services/api';
import { formatINR, formatINRExact, formatNumber, formatPct } from '../utils/format';

export default function OverviewPage() {
  const overview = useFilteredApi(api.overview);
  const trends = useFilteredApi(api.trends);
  const [granularity, setGranularity] = useState('monthly');

  return (
    <>
      <Async result={overview} isEmpty={(d) => !d.has_data}>
        {(o) => (
          <>
            <div className="kpis">
              <KpiCard label="Gross revenue" value={formatINR(o.gross_revenue)} sub="Quantity × unit price" />
              <KpiCard label="Net revenue" value={formatINR(o.net_revenue)} sub={`After ${formatINR(o.discount_amount)} discounts (${formatPct(o.discount_rate_pct)})`} />
              <KpiCard label="Valid orders" value={formatNumber(o.valid_orders)} sub="Delivered + shipped" />
              <KpiCard label="Units sold" value={formatNumber(o.units_sold)} />
              <KpiCard label="Average order value" value={formatINRExact(o.average_order_value)} sub="Net revenue ÷ distinct orders" />
              <KpiCard label="Purchasing customers" value={formatNumber(o.purchasing_customers)} />
            </div>
            <div className="grid two" style={{ gridTemplateColumns: '1fr' }}>
              <Card
                title="Net revenue trend"
                subtitle="Delivered and shipped orders, after discounts"
                actions={(
                  <>
                    <div className="seg" role="group" aria-label="Granularity">
                      {['monthly', 'daily'].map((g) => (
                        <button key={g} className={granularity === g ? 'on' : ''} onClick={() => setGranularity(g)}>
                          {g === 'monthly' ? 'Monthly' : 'Daily'}
                        </button>
                      ))}
                    </div>
                    <ExportButton dataset={granularity === 'monthly' ? 'monthly_trend' : 'daily_trend'} />
                  </>
                )}
              >
                <Async result={trends} isEmpty={(d) => d.daily.length === 0}>
                  {(t) => <TrendChart data={t[granularity]} granularity={granularity} />}
                </Async>
              </Card>
            </div>
            <Card title="Excluded from revenue" subtitle="Valid records that are not counted as sales">
              <div className="kpis" style={{ marginBottom: 0 }}>
                {['Cancelled', 'Returned'].map((s) => (
                  <div key={s}>
                    <div className="label" style={{ color: 'var(--text-2)' }}>{s} orders</div>
                    <div style={{ fontSize: 20, fontWeight: 600 }}>{formatNumber(o.excluded[s].orders)}</div>
                    <div className="sub" style={{ color: 'var(--text-3)', fontSize: 12 }}>
                      {formatINR(o.excluded[s].value)} order value not counted
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </Async>
    </>
  );
}

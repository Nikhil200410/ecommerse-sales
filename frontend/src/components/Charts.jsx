import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { compactNumber, formatINR, formatINRCompact, formatNumber, monthLabel, shortDate, truncate } from '../utils/format';

const axisTick = { fill: 'var(--text-2)', fontSize: 12 };
const tooltipStyle = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12.5 },
  labelStyle: { color: 'var(--text-2)', marginBottom: 4 },
  itemStyle: { color: 'var(--text)' },
  cursor: { fill: 'color-mix(in srgb, var(--series-1) 10%, transparent)' },
};

/** Horizontal bars, one hue (single measure). valueKind: 'inr' | 'count'. */
export function HBarChart({ data, labelKey, valueKey, valueLabel, valueKind = 'inr', height, labelWidth = 150 }) {
  const fmt = valueKind === 'inr' ? formatINR : formatNumber;
  const tick = valueKind === 'inr' ? formatINRCompact : compactNumber;
  const h = height || Math.max(180, data.length * 30 + 40);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap={8}>
        <CartesianGrid horizontal={false} stroke="var(--grid)" />
        <XAxis type="number" tick={axisTick} tickFormatter={tick} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey={labelKey} width={labelWidth} tick={axisTick} tickFormatter={(v) => truncate(v, 24)}
          axisLine={{ stroke: 'var(--border)' }} tickLine={false} interval={0} />
        <Tooltip {...tooltipStyle} formatter={(v) => [fmt(v), valueLabel]} />
        <Bar dataKey={valueKey} name={valueLabel} fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Vertical bars (few categories). */
export function ColumnChart({ data, labelKey, valueKey, valueLabel, valueKind = 'inr', height = 260 }) {
  const fmt = valueKind === 'inr' ? formatINR : formatNumber;
  const tick = valueKind === 'inr' ? formatINRCompact : compactNumber;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey={labelKey} tick={axisTick} tickFormatter={(v) => truncate(v, 14)} axisLine={{ stroke: 'var(--border)' }} tickLine={false} interval={0} />
        <YAxis tick={axisTick} tickFormatter={tick} axisLine={false} tickLine={false} width={64} />
        <Tooltip {...tooltipStyle} formatter={(v) => [fmt(v), valueLabel]} />
        <Bar dataKey={valueKey} name={valueLabel} fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Net revenue over time; granularity 'daily' | 'monthly'. */
export function TrendChart({ data, granularity }) {
  const xKey = granularity === 'daily' ? 'date' : 'month';
  const label = granularity === 'daily' ? shortDate : monthLabel;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey={xKey} tick={axisTick} tickFormatter={label} minTickGap={36} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
        <YAxis tick={axisTick} tickFormatter={formatINRCompact} axisLine={false} tickLine={false} width={72} />
        <Tooltip {...tooltipStyle} cursor={{ stroke: 'var(--text-3)', strokeDasharray: '3 3' }} labelFormatter={label}
          formatter={(v, name, item) => (name === 'Net revenue'
            ? [formatINR(v), name]
            : [formatNumber(v), name, item])} />
        <Line type="monotone" dataKey="net_revenue" name="Net revenue" stroke="var(--series-1)" strokeWidth={2} dot={false}
          activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

const PIE_COLORS = ['var(--series-1)', 'var(--series-2)'];

/** Two-slice donut with a legend (identity is never colour-alone: names + values are listed too). */
export function DonutChart({ data, nameKey, valueKey, valueFormatter = formatNumber }) {
  return (
    <>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Tooltip {...tooltipStyle} formatter={(v, n) => [valueFormatter(v), n]} />
          <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius={58} outerRadius={88} paddingAngle={2}
            stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
            {data.map((d, i) => <Cell key={d[nameKey]} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="legend">
        {data.map((d, i) => (
          <span key={d[nameKey]}>
            <span className="swatch" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
            {d[nameKey]}: <strong style={{ color: 'var(--text)' }}>{valueFormatter(d[valueKey])}</strong>
          </span>
        ))}
      </div>
    </>
  );
}

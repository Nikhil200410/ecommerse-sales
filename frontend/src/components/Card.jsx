import { useFilters } from '../context/FilterContext';
import { exportUrl } from '../services/api';

export function Card({ title, subtitle, actions, children }) {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="card-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function KpiCard({ label, value, sub }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

/** Downloads the Spark result table as CSV, honouring the active filters. */
export function ExportButton({ dataset, label = 'Export CSV' }) {
  const { filters } = useFilters();
  return (
    <a className="btn sm" href={exportUrl(dataset, filters)} download>
      ⬇ {label}
    </a>
  );
}

export function DataTable({ columns, rows, rowKey }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.num ? 'num' : ''}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey ? r[rowKey] : i}>
              {columns.map((c) => (
                <td key={c.key} className={c.num ? 'num' : ''}>{c.render ? c.render(r[c.key], r) : r[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

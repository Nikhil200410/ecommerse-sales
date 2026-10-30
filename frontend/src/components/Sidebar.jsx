export const PAGES = [
  { id: 'overview', label: 'Overview', icon: '◧' },
  { id: 'products', label: 'Products', icon: '▤' },
  { id: 'customers', label: 'Customers', icon: '☰' },
  { id: 'geography', label: 'Geography', icon: '◎' },
  { id: 'payments', label: 'Payments', icon: '₹' },
  { id: 'quality', label: 'Data Quality', icon: '✓' },
];

export default function Sidebar({ current }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">S</span>
        <span>Sales Analytics</span>
      </div>
      <nav style={{ display: 'contents' }} aria-label="Main">
        {PAGES.map((p) => (
          <a key={p.id} href={`#/${p.id}`} className={`nav-link${current === p.id ? ' active' : ''}`}
            aria-current={current === p.id ? 'page' : undefined}>
            <span className="ico" aria-hidden="true">{p.icon}</span>
            {p.label}
          </a>
        ))}
      </nav>
      <div className="sidebar-foot">Powered by Apache Spark<br />(synthetic demo data)</div>
    </aside>
  );
}

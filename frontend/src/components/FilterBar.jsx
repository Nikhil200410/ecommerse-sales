import { useFilters } from '../context/FilterContext';

export default function FilterBar({ options }) {
  const { filters, setFilter, reset, active } = useFilters();
  const min = options?.min_date || undefined;
  const max = options?.max_date || undefined;

  return (
    <div className="filters" role="search" aria-label="Dashboard filters">
      <div className="field">
        <label htmlFor="f-start">From</label>
        <input id="f-start" type="date" min={min} max={filters.end || max} value={filters.start}
          onChange={(e) => setFilter('start', e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="f-end">To</label>
        <input id="f-end" type="date" min={filters.start || min} max={max} value={filters.end}
          onChange={(e) => setFilter('end', e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="f-cat">Category</label>
        <select id="f-cat" value={filters.category} onChange={(e) => setFilter('category', e.target.value)}>
          <option value="">All categories</option>
          {(options?.categories || []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="f-city">City</label>
        <select id="f-city" value={filters.city} onChange={(e) => setFilter('city', e.target.value)}>
          <option value="">All cities</option>
          {(options?.cities || []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <button className="btn" onClick={reset} disabled={!active}>Reset filters</button>
      <span className="filter-note">
        {active ? 'Filtered results are computed live by Spark (first query of a combination takes a few seconds).' : 'Showing precomputed Spark results.'}
      </span>
    </div>
  );
}

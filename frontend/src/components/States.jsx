export function Loading({ label = 'Loading data…' }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state" role="alert">
      <h4>Something went wrong</h4>
      <p>{error?.message || 'Unexpected error.'}</p>
      {onRetry && <button className="btn" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function EmptyState({ title = 'No data for this selection', hint = 'Try widening the date range or resetting the filters.' }) {
  return (
    <div className="state">
      <h4>{title}</h4>
      <p>{hint}</p>
    </div>
  );
}

/** Renders loading / error / empty / content for a useApi() result. */
export function Async({ result, isEmpty, children, emptyHint }) {
  if (result.loading) return <Loading />;
  if (result.error) return <ErrorState error={result.error} onRetry={result.reload} />;
  if (isEmpty && isEmpty(result.data)) return <EmptyState hint={emptyHint} />;
  return children(result.data, result.meta);
}

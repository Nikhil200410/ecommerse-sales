import { useEffect, useState } from 'react';
import Sidebar, { PAGES } from './components/Sidebar';
import { ErrorState, Loading } from './components/States';
import { FilterProvider } from './context/FilterContext';
import { useApi } from './hooks/useApi';
import CustomersPage from './pages/CustomersPage';
import DataQualityPage from './pages/DataQualityPage';
import GeographyPage from './pages/GeographyPage';
import OverviewPage from './pages/OverviewPage';
import PaymentsPage from './pages/PaymentsPage';
import ProductsPage from './pages/ProductsPage';
import { api } from './services/api';
import { shortDate } from './utils/format';

const PAGE_INFO = {
  overview: { title: 'Overview', text: 'Revenue, orders and customers', Component: OverviewPage },
  products: { title: 'Products', text: 'Best sellers, categories and slow movers', Component: ProductsPage },
  customers: { title: 'Customers', text: 'Top spenders, repeat buyers and RFM segments', Component: CustomersPage },
  geography: { title: 'Geography', text: 'Where the revenue comes from', Component: GeographyPage },
  payments: { title: 'Payments', text: 'Orders and revenue by payment method', Component: PaymentsPage },
  quality: { title: 'Data Quality', text: 'What the Spark ETL accepted, rejected and de-duplicated', Component: DataQualityPage },
};

function useHashPage() {
  const read = () => {
    const id = window.location.hash.replace(/^#\//, '');
    return PAGES.some((p) => p.id === id) ? id : 'overview';
  };
  const [page, setPage] = useState(read);
  useEffect(() => {
    const onHash = () => setPage(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return page;
}

function Dashboard({ page }) {
  const info = PAGE_INFO[page];
  const options = useApi(() => api.filterOptions(), []);
  const { Component } = info;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{info.title}</h1>
          <p>
            {info.text}
            {options.data ? ` · data from ${shortDate(options.data.min_date)} to ${shortDate(options.data.max_date)}` : ''}
            {' · Precomputed static snapshot; filters and cloud processing are disabled.'}
          </p>
        </div>
      </div>
      <Component />
    </>
  );
}

export default function App() {
  const page = useHashPage();
  const status = useApi(() => api.status(), []);

  let body;
  if (status.loading) body = <Loading label="Connecting to the API…" />;
  else if (status.error) body = <ErrorState error={status.error} onRetry={status.reload} />;
  else body = <Dashboard page={page} />;

  return (
    <FilterProvider>
      <div className="app">
        <Sidebar current={page} />
        <main className="main">{body}</main>
      </div>
    </FilterProvider>
  );
}

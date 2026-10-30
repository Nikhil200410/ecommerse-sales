import { useCallback, useEffect, useState } from 'react';
import FilterBar from './components/FilterBar';
import ProcessingGate from './components/ProcessingGate';
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
  overview: { title: 'Overview', text: 'Revenue, orders and customers across the selected period', filters: true, Component: OverviewPage },
  products: { title: 'Products', text: 'Best sellers, categories and slow movers', filters: true, Component: ProductsPage },
  customers: { title: 'Customers', text: 'Top spenders, repeat buyers and RFM segments', filters: true, Component: CustomersPage },
  geography: { title: 'Geography', text: 'Where the revenue comes from', filters: true, Component: GeographyPage },
  payments: { title: 'Payments', text: 'Orders and revenue by payment method', filters: true, Component: PaymentsPage },
  quality: { title: 'Data Quality', text: 'What the Spark ETL accepted, rejected and de-duplicated', filters: false, Component: DataQualityPage },
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

function Dashboard({ page, onRerun }) {
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
            {options.data && info.filters ? ` · data from ${shortDate(options.data.min_date)} to ${shortDate(options.data.max_date)}` : ''}
          </p>
        </div>
      </div>
      {info.filters && <FilterBar options={options.data} />}
      <Component onRerun={onRerun} />
    </>
  );
}

export default function App() {
  const page = useHashPage();
  const status = useApi(() => api.status(), []);
  const [forceGate, setForceGate] = useState(false);

  const handleDone = useCallback(() => {
    setForceGate(false);
    status.reload();
  }, [status.reload]); // eslint-disable-line react-hooks/exhaustive-deps

  let body;
  if (status.loading) body = <Loading label="Connecting to the API…" />;
  else if (status.error) body = <ErrorState error={status.error} onRetry={status.reload} />;
  else if (forceGate || !status.data.processed || status.data.job.state === 'running') {
    body = <ProcessingGate status={status.data} onDone={handleDone} onRefresh={status.reload} />;
  } else {
    body = <Dashboard page={page} onRerun={() => setForceGate(true)} />;
  }

  return (
    <FilterProvider>
      <div className="app">
        <Sidebar current={page} />
        <main className="main">{body}</main>
      </div>
    </FilterProvider>
  );
}

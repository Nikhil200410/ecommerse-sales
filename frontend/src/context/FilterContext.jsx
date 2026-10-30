import { createContext, useContext, useMemo, useState } from 'react';

const EMPTY = { start: '', end: '', category: '', city: '' };
const FilterContext = createContext(null);

export function FilterProvider({ children }) {
  const [filters, setFilters] = useState(EMPTY);
  const value = useMemo(
    () => ({
      filters,
      setFilter: (key, val) => setFilters((f) => ({ ...f, [key]: val })),
      reset: () => setFilters(EMPTY),
      active: Object.values(filters).some(Boolean),
    }),
    [filters],
  );
  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export const useFilters = () => useContext(FilterContext);

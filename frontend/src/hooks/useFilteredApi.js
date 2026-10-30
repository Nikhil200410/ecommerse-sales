import { useFilters } from '../context/FilterContext';
import { useApi } from './useApi';

/** useApi bound to the active dashboard filters. */
export function useFilteredApi(fetcher) {
  const { filters } = useFilters();
  const { start, end, category, city } = filters;
  return useApi(() => fetcher(filters), [start, end, category, city]);
}

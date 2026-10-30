import { useCallback, useEffect, useRef, useState } from 'react';

/** Runs `fetcher` whenever `deps` change; ignores out-of-date responses. */
export function useApi(fetcher, deps) {
  const [state, setState] = useState({ data: null, meta: null, loading: true, error: null });
  const counter = useRef(0);

  const load = useCallback(() => {
    const id = ++counter.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcher()
      .then((body) => {
        if (id === counter.current) setState({ data: body.data, meta: body.meta, loading: false, error: null });
      })
      .catch((error) => {
        if (id === counter.current) setState({ data: null, meta: null, loading: false, error });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load();
    return () => {
      counter.current++;
    };
  }, [load]);

  return { ...state, reload: load };
}

import { useCallback, useEffect, useRef, useState } from 'react';

/** Loads data when `deps` change; keeps the last good data visible while reloading. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const call = useRef(0);

  const reload = useCallback(async () => {
    const id = ++call.current;
    setLoading(true);
    setError(null);
    try {
      const result = await load();
      if (id === call.current) setData(result);
    } catch (err) {
      if (id === call.current) setError(err instanceof Error ? err.message : 'Could not load');
    } finally {
      if (id === call.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, setData, error, loading, reload };
}

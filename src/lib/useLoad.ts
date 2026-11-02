import { useCallback, useEffect, useRef, useState } from 'react';

// Last good data per screen, so going back to a screen shows it at once while it refreshes
const cache = new Map<string, unknown>();

/** Forgets every remembered screen, e.g. when someone logs out. */
export function clearLoadCache(): void {
  cache.clear();
}

/**
 * Loads data when `deps` change; keeps the last good data visible while reloading.
 * With a `cacheKey`, data seen before under that key shows straight away and is
 * refreshed in the background.
 */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[], cacheKey?: string) {
  const [data, setDataState] = useState<T | null>(() => (cacheKey && cache.has(cacheKey) ? (cache.get(cacheKey) as T) : null));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const call = useRef(0);
  const key = useRef(cacheKey);
  key.current = cacheKey;

  const setData = useCallback((value: T | null | ((prev: T | null) => T | null)) => {
    setDataState((prev) => {
      const next = typeof value === 'function' ? (value as (p: T | null) => T | null)(prev) : value;
      if (key.current && next !== null) cache.set(key.current, next);
      return next;
    });
  }, []);

  const reload = useCallback(async () => {
    const id = ++call.current;
    // A new key (another day, another month) shows what was remembered for it, if anything
    if (key.current && cache.has(key.current)) setDataState(cache.get(key.current) as T);
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

import { useCallback, useEffect, useRef, useState } from "react";

/** Loads `fn` now and every `intervalMs`, while the tab is visible. `refresh` reloads immediately. */
export function usePolling<T>(fn: (() => Promise<T>) | null, intervalMs = 1500) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refresh = useCallback(async () => {
    const current = fnRef.current;
    if (!current) return;
    try {
      setData(await current());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    setData(undefined);
    if (!fn) return;
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, intervalMs);
    return () => clearInterval(timer);
    // `fn` identity changes whenever its inputs do; that is what restarts polling.
  }, [fn, intervalMs, refresh]);

  return { data, error, refresh };
}

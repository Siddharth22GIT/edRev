"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "@/lib/api";

export interface Resource<T> {
  data: T | null;
  loading: boolean;
  /** A short, readable reason when the request failed (never a raw server error). */
  error: string | null;
  retry: () => void;
}

/**
 * Loads one API path (`{ data }` responses) with its own loading / error / retry state.
 * U8: each dashboard card reads its own resources, so one failing request only breaks the cards that need it.
 * Pass `null` as the path to skip the request (e.g. a role without the permission).
 * `pick` reads responses that aren't `{ data }` (e.g. `/dashboard` returns `{ metrics }`).
 */
export function useResource<T>(path: string | null, pick?: (json: any) => T | null): Resource<T> {
  const { apiFetch } = useApi();
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch(path)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setError(res.status === 403 ? "You don't have access to this." : res.status >= 500 ? "The server couldn't load this." : "Couldn't load this.");
          return;
        }
        setData(pickRef.current ? pickRef.current(json) : ((json?.data ?? null) as T | null));
      })
      .catch(() => {
        if (!cancelled) setError("Network error: is the API running?");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // apiFetch is recreated each render; re-run only when the path or an explicit retry changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, version]);

  const retry = useCallback(() => setVersion((v) => v + 1), []);
  return { data, loading, error, retry };
}

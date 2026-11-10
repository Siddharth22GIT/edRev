"use client";

import { useCallback, useState } from "react";
import { useApi } from "@/lib/api";
import { useToast } from "@/lib/toast";

/**
 * Phase 4: one way to send a change to the API from a button. Shows the server's `{ message }` as a toast
 * (success or error) and returns the parsed body, or null when the request failed.
 */
export function useAction() {
  const { apiFetch } = useApi();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(
    async <T = any>(key: string, path: string, options: { method?: string; body?: unknown; success?: string; quiet?: boolean } = {}): Promise<T | null> => {
      setBusy(key);
      try {
        const res = await apiFetch(path, {
          method: options.method ?? "POST",
          headers: { "Content-Type": "application/json" },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          toast(json?.message || "That didn't work. Please try again.", "error");
          return null;
        }
        if (!options.quiet) toast(options.success ?? json?.message ?? "Saved.", "success");
        return json as T;
      } catch {
        toast("Network error: is the API running?", "error");
        return null;
      } finally {
        setBusy(null);
      }
    },
    // apiFetch is recreated every render; the toast function is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toast]
  );

  return { run, busy };
}

"use client";

import { useAuth } from "@/lib/auth-context";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

/**
 * Authenticated fetch for the EduRev API. Paths are relative to API_BASE (e.g. "/students").
 * Attaches the session's Bearer token; if the server rejects a token we sent, the session is cleared
 * and the workspace auth gate returns the user to /login.
 */
export function useApi() {
  const { token, getAuthHeaders, logout } = useAuth();

  const apiFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...getAuthHeaders(), ...(init.headers as Record<string, string> | undefined) },
    });
    if (res.status === 401 && token) {
      logout();
    }
    return res;
  };

  /** Fetch a protected file (e.g. a proposal document) and return a local object URL for it. */
  const fetchBlobUrl = async (path: string): Promise<{ url: string; filename: string | null }> => {
    const res = await apiFetch(path);
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      throw new Error(json?.message || "Unable to load document.");
    }
    const blob = await res.blob();
    return { url: URL.createObjectURL(blob), filename: filenameFromDisposition(res.headers.get("Content-Disposition")) };
  };

  return { apiFetch, fetchBlobUrl };
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // fall through to the plain filename
    }
  }
  return header.match(/filename="([^"]+)"/i)?.[1] ?? null;
}

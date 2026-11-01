// Small in-memory sliding-window limiter (per API process). Good enough for one server; a shared store
// would be needed if the API is ever run as several instances.

const buckets = new Map<string, number[]>();

function recent(key: string, windowMs: number): number[] {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  buckets.set(key, hits);
  return hits;
}

/** Records a hit and returns false once `limit` hits have happened within `windowMs`. */
export function consume(key: string, limit: number, windowMs: number): boolean {
  const hits = recent(key, windowMs);
  if (hits.length >= limit) return false;
  hits.push(Date.now());
  return true;
}

/** True when `key` already has `limit` recorded hits within `windowMs` (does not record a hit). */
export function isLimited(key: string, limit: number, windowMs: number): boolean {
  return recent(key, windowMs).length >= limit;
}

export function record(key: string): void {
  const hits = buckets.get(key) ?? [];
  hits.push(Date.now());
  buckets.set(key, hits);
}

export function clear(key: string): void {
  buckets.delete(key);
}

/** Test helper. */
export function resetRateLimits(): void {
  buckets.clear();
}

// E9: dates in the institution's timezone (Settings → timezone, e.g. Asia/Kolkata) instead of UTC.
// A date-only deadline like "2026-09-20" means "by the end of 20 September where the institution is".

import { getSettingsService } from "../services/analytics.service.js";

export const DEFAULT_TIME_ZONE = "Asia/Kolkata";

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The institution's timezone from Settings, or Asia/Kolkata if it's missing or invalid. */
export async function getInstitutionTimeZone(): Promise<string> {
  try {
    const tz = (await getSettingsService())?.timezone;
    return isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** Milliseconds the zone is ahead of UTC at `at` (e.g. +5:30 → 19 800 000). Handles daylight saving zones too. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The calendar date ("YYYY-MM-DD") of `at` in `timeZone`. */
export function dateInTimeZone(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** The last millisecond of calendar day `ymd` ("YYYY-MM-DD") in `timeZone`, as a real instant. */
export function endOfDayInTimeZone(ymd: string, timeZone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const localEnd = Date.UTC(y, m - 1, d, 23, 59, 59, 999);
  let instant = localEnd - zoneOffsetMs(new Date(localEnd), timeZone);
  instant = localEnd - zoneOffsetMs(new Date(instant), timeZone); // second pass settles daylight-saving edges
  return new Date(instant);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turns a stored deadline into the instant it ends: date-only values end at 23:59:59.999 in `timeZone`,
 * full timestamps are used as they are. Returns null for empty or unreadable values.
 */
export function deadlineInstant(value: string | undefined | null, timeZone: string): Date | null {
  if (!value) return null;
  if (DATE_ONLY.test(value)) return endOfDayInTimeZone(value, timeZone);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

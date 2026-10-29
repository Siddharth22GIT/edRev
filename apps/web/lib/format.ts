export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string): string {
  if (!value) return "";
  const dateObj = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`);
  const finalDate = isNaN(dateObj.getTime()) ? new Date(value) : dateObj;
  if (isNaN(finalDate.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(finalDate);
}

export function titleCase(value: string): string {
  return value.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

/** "just now", "5m ago", "3h ago", "yesterday", or a date for older times. */
export function timeAgo(value: string, now = Date.now()): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((now - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return "yesterday";
  return formatDate(value);
}

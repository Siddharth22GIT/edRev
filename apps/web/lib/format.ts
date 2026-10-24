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

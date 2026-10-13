import { isOngoing, MONTHS_PER_YEAR } from "./months";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const KIB = 1024;
const MIB = KIB * KIB;

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

export function formatDuration(months: number): string {
  const years = Math.floor(months / MONTHS_PER_YEAR);
  const rest = months % MONTHS_PER_YEAR;
  const parts = [years > 0 ? plural(years, "yr") : "", rest > 0 ? plural(rest, "mo") : ""].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Less than a month";
}

export function formatMonth(value: string | null): string {
  if (!value) return "?";
  if (isOngoing(value)) return "Present";
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (match) return `${MONTH_NAMES[Number(match[2]) - 1] ?? match[2]} ${match[1]}`;
  return value.trim();
}

export function formatSpan(start: string | null, end: string | null): string {
  if (!start && !end) return "Dates not given";
  return `${formatMonth(start)} – ${formatMonth(end)}`;
}

// Resumes often set the name in capitals; show it in title case. Mixed case is the
// candidate's own spelling ("McKenzie") and is left alone. The JSON keeps the original.
export function displayName(name: string | null): string {
  if (!name?.trim()) return "Unnamed candidate";
  const trimmed = name.trim();
  const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
  if (!isAllCaps) return trimmed;
  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function initials(name: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : "";
  return `${first}${last}`.toUpperCase();
}

export function formatFileSize(bytes: number): string {
  if (bytes < KIB) return `${bytes} B`;
  if (bytes < MIB) return `${Math.round(bytes / KIB)} KB`;
  return `${(bytes / MIB).toFixed(1).replace(/\.0$/, "")} MB`;
}

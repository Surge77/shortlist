// The date formats the extraction prompt asks Gemini for: "YYYY-MM", "YYYY" or "Present".
// Mirrors backend/app/experience.py so the timeline and the computed total agree.

export const MONTHS_PER_YEAR = 12;
const ONGOING = new Set(["present", "current", "now", "ongoing", "till date", "to date"]);
const YEAR_MONTH = /^(\d{4})-(\d{2})$/;
const YEAR_ONLY = /^(\d{4})$/;

export function isOngoing(value: string | null): boolean {
  return value !== null && ONGOING.has(value.trim().toLowerCase());
}

// Months since year 0, so two dates subtract to a month count. A bare year reads as
// January when it starts a job and December when it ends one.
export function monthIndex(value: string | null, isEnd: boolean, today: Date): number | null {
  if (!value) return null;
  const text = value.trim();
  if (isOngoing(text)) return isEnd ? today.getFullYear() * MONTHS_PER_YEAR + today.getMonth() : null;
  const yearMonth = YEAR_MONTH.exec(text);
  if (yearMonth) {
    const month = Number(yearMonth[2]);
    if (month < 1 || month > MONTHS_PER_YEAR) return null;
    return Number(yearMonth[1]) * MONTHS_PER_YEAR + month - 1;
  }
  const yearOnly = YEAR_ONLY.exec(text);
  if (yearOnly) return Number(yearOnly[1]) * MONTHS_PER_YEAR + (isEnd ? MONTHS_PER_YEAR - 1 : 0);
  return null;
}

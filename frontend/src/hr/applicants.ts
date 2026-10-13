import type { Applicant, Band, Stage } from "../data/types";
import { displayName } from "../format";
import { BAND_LABEL, STAGE_LABEL } from "../labels";
import type { ExtractResponse } from "../types";

export type SortKey = "score" | "newest" | "oldest";

export interface ApplicantFilters {
  query: string;
  band: Band | "all" | "unscored";
  stage: Stage | "all";
  onlyKnockouts: boolean;
}

export const NO_FILTERS: ApplicantFilters = { query: "", band: "all", stage: "all", onlyKnockouts: false };

const ID_SUFFIX_CHARS = 6;

// Blind mode replaces names with a stable label derived from the application id.
export function candidateLabel(applicant: Pick<Applicant, "id" | "full_name">, isBlind: boolean): string {
  if (isBlind) return `Candidate ${applicant.id.slice(0, ID_SUFFIX_CHARS).toUpperCase()}`;
  return displayName(applicant.full_name);
}

export function knockoutCount(applicant: Applicant): number {
  return applicant.score?.breakdown.knockouts.length ?? 0;
}

export function isStale(applicant: Applicant, requirementsVersion: number): boolean {
  return applicant.score !== null && applicant.score.requirements_version < requirementsVersion;
}

// Scoring takes well under a minute; a row still "processing" after this long lost its
// background task (a server restart, say) and needs HR to rescore it.
export const STUCK_AFTER_MS = 5 * 60 * 1000;

export function isProcessing(applicant: Pick<Applicant, "processing_status">): boolean {
  return applicant.processing_status === "processing";
}

export function isStuck(applicant: Pick<Applicant, "processing_status" | "updated_at">, now: number): boolean {
  return isProcessing(applicant) && now - new Date(applicant.updated_at).getTime() > STUCK_AFTER_MS;
}

export function filterApplicants(rows: Applicant[], filters: ApplicantFilters, isBlind: boolean): Applicant[] {
  const query = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (query && !candidateLabel(row, isBlind).toLowerCase().includes(query)) return false;
    if (filters.stage !== "all" && row.stage !== filters.stage) return false;
    if (filters.band === "unscored" && row.score?.total != null) return false;
    if (filters.band !== "all" && filters.band !== "unscored" && row.score?.band !== filters.band) return false;
    if (filters.onlyKnockouts && knockoutCount(row) === 0) return false;
    return true;
  });
}

export function sortApplicants(rows: Applicant[], key: SortKey): Applicant[] {
  const byDate = (a: Applicant, b: Applicant) => a.created_at.localeCompare(b.created_at);
  const sorted = [...rows];
  if (key === "oldest") return sorted.sort(byDate);
  if (key === "newest") return sorted.sort((a, b) => byDate(b, a));
  // Unscored applications (processing, failed, no requirements) sink to the bottom.
  return sorted.sort((a, b) => (b.score?.total ?? -1) - (a.score?.total ?? -1) || byDate(b, a));
}

export function stageCounts(rows: Applicant[]): Record<Stage, number> {
  const counts: Record<Stage, number> = {
    submitted: 0, reviewing: 0, shortlisted: 0, rejected: 0, hired: 0, withdrawn: 0,
  };
  for (const row of rows) counts[row.stage] += 1;
  return counts;
}

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  // A leading = + - @ makes spreadsheets run the cell as a formula; prefix it with '.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function applicantsCsv(rows: Applicant[], isBlind: boolean): string {
  const header = ["Candidate", "Score", "Fit", "Missing must-haves", "Stage", "Applied"];
  const lines = rows.map((row) =>
    [
      candidateLabel(row, isBlind),
      row.score?.total ?? null,
      row.score?.band ? BAND_LABEL[row.score.band] : null,
      row.score?.breakdown.knockouts.join("; ") ?? null,
      STAGE_LABEL[row.stage],
      row.created_at.slice(0, 10),
    ].map(csvCell).join(","),
  );
  return [header.join(","), ...lines].join("\r\n");
}

// Warnings about contact details would give away that they were hidden, not missing.
const CONTACT_WARNING = /email|phone|linkedin/i;

// Same rule as backend/app/matching.py redact(): name parts this short ("Li") would blank
// out ordinary words too.
const MIN_NAME_PART_CHARS = 3;
const REDACTED_NAME = "[candidate]";

function namePattern(fullName: string | null): RegExp | null {
  const parts = (fullName ?? "").split(/[^\p{L}\p{N}]+/u).filter((part) => part.length >= MIN_NAME_PART_CHARS);
  if (parts.length === 0) return null;
  const escaped = parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join("|")})(?![\\p{L}\\p{N}])`, "giu");
}

function redactStrings(value: unknown, pattern: RegExp): unknown {
  if (typeof value === "string") return value.replace(pattern, REDACTED_NAME);
  if (Array.isArray(value)) return value.map((item) => redactStrings(item, pattern));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactStrings(item, pattern)]));
  }
  return value;
}

export function blindRecord(result: ExtractResponse): ExtractResponse {
  const pattern = namePattern(result.candidate.full_name);
  // The summary, headline and job highlights often repeat the candidate's name.
  const candidate = pattern ? (redactStrings(result.candidate, pattern) as ExtractResponse["candidate"]) : result.candidate;
  return {
    ...result,
    candidate: {
      ...candidate,
      full_name: null,
      contact: { email: null, phone: null, location: null, linkedin: null, github: null, portfolio: null },
    },
    warnings: result.warnings.filter((warning) => !CONTACT_WARNING.test(warning)),
    invalid_fields: [],
    source_text: null,
  };
}

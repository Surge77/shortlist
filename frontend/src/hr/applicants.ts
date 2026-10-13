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

export function blindRecord(result: ExtractResponse): ExtractResponse {
  const { candidate } = result;
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

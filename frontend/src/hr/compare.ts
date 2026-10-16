import type { ApplicationDetail, CategoryResult, RequirementResult, ScoreCategory } from "../data/types";

export const MAX_COMPARE = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RequirementRow {
  id: string;
  text: string;
  category: ScoreCategory;
  // One cell per candidate, in column order; null when that score has no such requirement.
  cells: (RequirementResult | null)[];
}

export interface CategoryRow {
  category: ScoreCategory;
  label: string;
  cells: (CategoryResult | null)[];
}

// "?ids=a,b,c" from a shared link: only well-formed ids, no repeats, at most three.
export function parseCompareIds(raw: string | null): string[] {
  const ids = (raw ?? "").split(",").map((id) => id.trim()).filter((id) => UUID.test(id));
  return [...new Set(ids)].slice(0, MAX_COMPARE);
}

export function compareLink(jobId: string, ids: string[]): string {
  return `/hr/jobs/${encodeURIComponent(jobId)}/compare?ids=${ids.map(encodeURIComponent).join(",")}`;
}

// Rows in the order the first candidate's score lists them, then any extras the others have.
export function requirementRows(details: ApplicationDetail[]): RequirementRow[] {
  const order: RequirementResult[] = [];
  for (const detail of details) {
    for (const requirement of detail.score?.breakdown.requirements ?? []) {
      if (!order.some((seen) => seen.id === requirement.id)) order.push(requirement);
    }
  }
  return order.map(({ id, text, category }) => ({
    id,
    text,
    category,
    cells: details.map((detail) => detail.score?.breakdown.requirements.find((r) => r.id === id) ?? null),
  }));
}

export function categoryRows(details: ApplicationDetail[]): CategoryRow[] {
  const first = details.find((detail) => detail.score)?.score?.breakdown.categories ?? [];
  return first.map(({ category, label }) => ({
    category,
    label,
    cells: details.map((detail) => detail.score?.breakdown.categories.find((c) => c.category === category) ?? null),
  }));
}

// Requirement ids are positional ("must-1"), so they only line up within one version.
export function hasMixedVersions(details: ApplicationDetail[]): boolean {
  return new Set(details.flatMap((detail) => (detail.score ? [detail.score.requirements_version] : []))).size > 1;
}

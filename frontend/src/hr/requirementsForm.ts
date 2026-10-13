import type { EducationLevel, JobRequirements, ScoreCategory, Weights } from "../data/types";

// The requirement builder edits each list as one item per line: easy to paste into,
// readable, and fully keyboard-accessible without a custom list widget.
export interface RequirementsDraft {
  mustHave: string;
  niceToHave: string;
  minYears: string;
  educationLevel: EducationLevel | "";
  educationFields: string;
  certifications: string;
}

export const MAX_YEARS = 40;
export const MAX_WEIGHT = 100;

export function toDraft(requirements: JobRequirements): RequirementsDraft {
  return {
    mustHave: requirements.must_have.join("\n"),
    niceToHave: requirements.nice_to_have.join("\n"),
    minYears: requirements.min_years === null ? "" : String(requirements.min_years),
    educationLevel: requirements.education_level ?? "",
    educationFields: requirements.education_fields.join("\n"),
    certifications: requirements.certifications.join("\n"),
  };
}

export function lines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export type Parsed = { ok: true; requirements: JobRequirements } | { ok: false; message: string };

export function fromDraft(draft: RequirementsDraft): Parsed {
  const years = draft.minYears.trim() === "" ? null : Number(draft.minYears);
  if (years !== null && (!Number.isFinite(years) || years < 0 || years > MAX_YEARS)) {
    return { ok: false, message: `Minimum years must be a number from 0 to ${MAX_YEARS}.` };
  }
  return {
    ok: true,
    requirements: {
      must_have: lines(draft.mustHave),
      nice_to_have: lines(draft.niceToHave),
      min_years: years,
      education_level: draft.educationLevel || null,
      education_fields: lines(draft.educationFields),
      certifications: lines(draft.certifications),
    },
  };
}

export function isEmpty(requirements: JobRequirements): boolean {
  return (
    requirements.must_have.length === 0 &&
    requirements.nice_to_have.length === 0 &&
    !requirements.min_years &&
    !requirements.education_level &&
    requirements.education_fields.length === 0 &&
    requirements.certifications.length === 0
  );
}

// Mirrors scored_categories() in backend/app/requirements.py: the categories the scorer keeps.
export function scoredCategories(requirements: JobRequirements): ScoreCategory[] {
  const asked: Record<ScoreCategory, boolean> = {
    must_have: requirements.must_have.length > 0,
    nice_to_have: requirements.nice_to_have.length > 0,
    experience: Boolean(requirements.min_years),
    education: Boolean(requirements.education_level) || requirements.education_fields.length > 0,
    certifications: requirements.certifications.length > 0,
  };
  return (Object.keys(asked) as ScoreCategory[]).filter((category) => asked[category]);
}

export function weightsProblem(weights: Weights, requirements: JobRequirements): string | null {
  const values = Object.values(weights);
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > MAX_WEIGHT)) {
    return `Each weight must be a whole number from 0 to ${MAX_WEIGHT}.`;
  }
  // Weighting every category the job asks about at zero would leave every application unscored.
  const scored = scoredCategories(requirements);
  return scored.every((category) => weights[category] === 0)
    ? "Give at least one of this job's requirement categories a weight above zero."
    : null;
}

export const WEIGHT_LABELS: Record<ScoreCategory, string> = {
  must_have: "Must-have skills",
  nice_to_have: "Nice-to-have skills",
  experience: "Experience",
  education: "Education",
  certifications: "Certifications",
};

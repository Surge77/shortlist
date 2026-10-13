import type { Applicant, Job, Score } from "../src/data/types";
import { DEFAULT_WEIGHTS } from "../src/data/types";

export function makeScore(overrides: Partial<Score> = {}): Score {
  return {
    total: 72,
    band: "possible",
    requirements_version: 1,
    breakdown: {
      categories: [
        { category: "must_have", label: "Must-have skills", credit: 0.75, max_points: 71.4, points: 53.6, detail: "1 of 2 met, 1 partly" },
      ],
      requirements: [
        { id: "must-1", category: "must_have", text: "SQL", verdict: "met", evidence: "Wrote SQL reports", unverified: false },
        { id: "must-2", category: "must_have", text: "Kubernetes", verdict: "missing", evidence: null, unverified: true },
      ],
      knockouts: ["Kubernetes"],
      flags: ["Evidence for “Kubernetes” is not in the resume, so it counts as missing"],
    },
    ...overrides,
  };
}

export function makeApplicant(overrides: Partial<Applicant> = {}): Applicant {
  return {
    id: "a1b2c3d4-0000-4000-8000-000000000001",
    stage: "submitted",
    processing_status: "scored",
    processing_error: null,
    created_at: "2026-10-10T09:00:00Z",
    full_name: "Riya Kulkarni",
    score: makeScore(),
    ...overrides,
  };
}

export function makeJobRow(overrides: Partial<Job> = {}): Job {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    title: "Data Engineer",
    department: "Analytics",
    location: "Pune",
    employment_type: "full_time",
    description: "Build and maintain data pipelines for the analytics team.",
    status: "open",
    requirements: {
      must_have: ["SQL", "Python"],
      nice_to_have: ["dbt"],
      min_years: 2,
      education_level: "bachelor",
      education_fields: ["Computer Science"],
      certifications: [],
    },
    requirements_version: 1,
    weights: DEFAULT_WEIGHTS,
    created_at: "2026-10-01T09:00:00Z",
    ...overrides,
  };
}

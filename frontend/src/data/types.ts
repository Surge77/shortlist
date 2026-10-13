// Rows as the frontend reads them from Supabase, and the API's request/response shapes.
// Mirrors supabase/migrations and backend/app/{requirements,scoring}.py.

import type { Candidate, CheckedField, SourceType } from "../types";

export type Role = "candidate" | "hr";
export type JobStatus = "draft" | "open" | "closed";
export type EmploymentType = "full_time" | "part_time" | "contract" | "internship";
export type Stage = "submitted" | "reviewing" | "shortlisted" | "rejected" | "hired" | "withdrawn";
export type ProcessingStatus = "processing" | "scored" | "failed";
export type EducationLevel = "high_school" | "diploma" | "bachelor" | "master" | "doctorate";
export type Band = "strong" | "possible" | "weak";
export type Verdict = "met" | "partial" | "missing";
export type ScoreCategory = "must_have" | "nice_to_have" | "experience" | "education" | "certifications";

export interface JobRequirements {
  must_have: string[];
  nice_to_have: string[];
  min_years: number | null;
  education_level: EducationLevel | null;
  education_fields: string[];
  certifications: string[];
}

export type Weights = Record<ScoreCategory, number>;

export interface JobFields {
  title: string;
  department: string | null;
  location: string | null;
  employment_type: EmploymentType;
  description: string;
}

export interface Job extends JobFields {
  id: string;
  status: JobStatus;
  requirements: JobRequirements | null;
  requirements_version: number;
  weights: Weights | null;
  created_at: string;
}

export interface HrJob extends Job {
  applicant_count: number;
}

export interface MyApplication {
  id: string;
  stage: Stage;
  created_at: string;
  job: { id: string; title: string; location: string | null; status: JobStatus } | null;
}

export interface RequirementResult {
  id: string;
  category: ScoreCategory;
  text: string;
  verdict: Verdict;
  evidence: string | null;
  unverified: boolean;
}

export interface CategoryResult {
  category: ScoreCategory;
  label: string;
  credit: number;
  max_points: number;
  points: number;
  detail: string;
}

export interface Score {
  total: number | null;
  band: Band | null;
  requirements_version: number;
  breakdown: {
    categories: CategoryResult[];
    requirements: RequirementResult[];
    knockouts: string[];
    flags: string[];
  };
}

export interface Applicant {
  id: string;
  stage: Stage;
  processing_status: ProcessingStatus;
  processing_error: string | null;
  created_at: string;
  full_name: string | null;
  score: Score | null;
}

export interface Extraction {
  record: Candidate;
  experience_months: number | null;
  warnings: string[];
  invalid_fields: CheckedField[];
  source_text: string | null;
}

export interface ApplicationDetail extends Applicant {
  job: Pick<Job, "id" | "title" | "requirements_version">;
  candidate_id: string;
  resume_path: string;
  source_type: SourceType;
  cover_note: string | null;
  extraction: Extraction | null;
}

export interface Note {
  id: string;
  body: string;
  created_at: string;
  author_name: string | null;
}

export interface StageEvent {
  id: number;
  from_stage: Stage;
  to_stage: Stage;
  created_at: string;
}

export const DEFAULT_WEIGHTS: Weights = {
  must_have: 50,
  nice_to_have: 15,
  experience: 20,
  education: 10,
  certifications: 5,
};

export const EMPTY_REQUIREMENTS: JobRequirements = {
  must_have: [],
  nice_to_have: [],
  min_years: null,
  education_level: null,
  education_fields: [],
  certifications: [],
};

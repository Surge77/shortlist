import type { Band, EducationLevel, EmploymentType, JobStatus, Stage, Verdict } from "./data/types";

export const STAGES: Stage[] = ["submitted", "reviewing", "shortlisted", "rejected", "hired", "withdrawn"];
// HR may move an application to any of these; withdrawing is the candidate's alone.
export const HR_STAGES: Stage[] = ["submitted", "reviewing", "shortlisted", "rejected", "hired"];
export const WITHDRAWABLE: Stage[] = ["submitted", "reviewing"];

export const STAGE_LABEL: Record<Stage, string> = {
  submitted: "Submitted",
  reviewing: "Under review",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
  hired: "Hired",
  withdrawn: "Withdrawn",
};

// What a candidate reads about their own application: plain, and never the score.
export const CANDIDATE_STAGE_LABEL: Record<Stage, string> = {
  ...STAGE_LABEL,
  rejected: "Not selected",
  hired: "Offer made",
};

export const BAND_LABEL: Record<Band, string> = { strong: "Strong fit", possible: "Possible fit", weak: "Weak fit" };
export const VERDICT_LABEL: Record<Verdict, string> = { met: "Met", partial: "Partly met", missing: "Missing" };
export const JOB_STATUS_LABEL: Record<JobStatus, string> = { draft: "Draft", open: "Open", closed: "Closed" };

export const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
};

export const EDUCATION_LABEL: Record<EducationLevel, string> = {
  high_school: "High school",
  diploma: "Diploma",
  bachelor: "Bachelor's degree",
  master: "Master's degree",
  doctorate: "Doctorate",
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : DATE_FORMAT.format(date);
}

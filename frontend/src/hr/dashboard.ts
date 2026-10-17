import type { Band, HrJob, ProcessingStatus, Stage } from "../data/types";
import { STAGES } from "../labels";

// One application as the overview needs it: across every job, with only the score's headline.
export interface OverviewRow {
  id: string;
  job_id: string;
  stage: Stage;
  processing_status: ProcessingStatus;
  created_at: string;
  full_name: string | null;
  score: { total: number | null; band: Band | null } | null;
}

export interface Headline {
  openJobs: number;
  applications: number;
  toReview: number;
  shortlisted: number;
  hired: number;
}

export interface StageCount {
  stage: Stage;
  count: number;
}

export interface JobSummary {
  job: HrJob;
  applicants: number;
  averageScore: number | null;
  strongFits: number;
}

export const NEWEST_COUNT = 6;
const NEEDS_REVIEW: Stage[] = ["submitted", "reviewing"];

export function headline(jobs: HrJob[], rows: OverviewRow[]): Headline {
  const count = (stages: Stage[]) => rows.filter((row) => stages.includes(row.stage)).length;
  return {
    openJobs: jobs.filter((job) => job.status === "open").length,
    applications: rows.filter((row) => row.stage !== "withdrawn").length,
    toReview: count(NEEDS_REVIEW),
    shortlisted: count(["shortlisted"]),
    hired: count(["hired"]),
  };
}

// Where applications sit right now, in pipeline order; empty stages stay so the shape is stable.
export function stageCounts(rows: OverviewRow[]): StageCount[] {
  return STAGES.map((stage) => ({ stage, count: rows.filter((row) => row.stage === stage).length }));
}

function scoredTotals(rows: OverviewRow[]): number[] {
  return rows.flatMap((row) => (row.score?.total == null ? [] : [row.score.total]));
}

export function averageOf(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Open jobs first, then the busiest; withdrawn applications don't count towards a job.
export function jobSummaries(jobs: HrJob[], rows: OverviewRow[]): JobSummary[] {
  const active = rows.filter((row) => row.stage !== "withdrawn");
  return jobs
    .map((job) => {
      const mine = active.filter((row) => row.job_id === job.id);
      return {
        job,
        applicants: mine.length,
        averageScore: averageOf(scoredTotals(mine)),
        strongFits: mine.filter((row) => row.score?.band === "strong").length,
      };
    })
    .sort((a, b) => Number(b.job.status === "open") - Number(a.job.status === "open") || b.applicants - a.applicants);
}

export function newest(rows: OverviewRow[], count = NEWEST_COUNT): OverviewRow[] {
  return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, count);
}

// Bar length as a share of the largest stage, so the biggest bar fills the track.
export function barPercent(count: number, counts: StageCount[]): number {
  const largest = Math.max(...counts.map((item) => item.count), 0);
  return largest === 0 ? 0 : Math.round((count / largest) * 100);
}

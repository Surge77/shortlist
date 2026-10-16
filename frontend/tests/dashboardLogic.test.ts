import { describe, expect, it } from "vitest";

import type { ApplicationDetail, HrJob } from "../src/data/types";
import { categoryRows, compareLink, hasMixedVersions, parseCompareIds, requirementRows } from "../src/hr/compare";
import { averageOf, barPercent, headline, jobSummaries, newest, stageCounts, type OverviewRow } from "../src/hr/dashboard";
import { makeApplicant, makeJobRow, makeScore } from "./portalFixtures";

const ID_A = "a1b2c3d4-0000-4000-8000-000000000001";
const ID_B = "a1b2c3d4-0000-4000-8000-000000000002";
const ID_C = "a1b2c3d4-0000-4000-8000-000000000003";
const ID_D = "a1b2c3d4-0000-4000-8000-000000000004";

function job(id: string, overrides: Partial<HrJob> = {}): HrJob {
  return { ...makeJobRow({ id }), applicant_count: 0, ...overrides };
}

function row(overrides: Partial<OverviewRow>): OverviewRow {
  return { id: "r", job_id: "j1", stage: "submitted", processing_status: "scored", created_at: "2026-10-10T00:00:00Z",
    full_name: "Asha", score: { total: 70, band: "possible" }, ...overrides };
}

describe("HR overview", () => {
  const jobs = [job("j1"), job("j2", { title: "Closed", status: "closed" }), job("j3", { title: "Busy" })];
  const rows = [
    row({ id: "1", job_id: "j1", stage: "submitted", score: { total: 90, band: "strong" } }),
    row({ id: "2", job_id: "j1", stage: "reviewing", score: { total: 60, band: "possible" } }),
    row({ id: "3", job_id: "j3", stage: "shortlisted", score: null }),
    row({ id: "4", job_id: "j3", stage: "hired", created_at: "2026-10-12T00:00:00Z" }),
    row({ id: "5", job_id: "j3", stage: "withdrawn" }),
    row({ id: "6", job_id: "j2", stage: "rejected" }),
  ];

  it("counts open jobs, live applications and what is waiting on HR", () => {
    expect(headline(jobs, rows)).toEqual({ openJobs: 2, applications: 5, toReview: 2, shortlisted: 1, hired: 1 });
  });

  it("counts every stage in pipeline order, keeping empty ones", () => {
    const counts = stageCounts(rows.slice(0, 2));
    expect(counts.map((c) => c.stage)).toEqual(["submitted", "reviewing", "shortlisted", "rejected", "hired", "withdrawn"]);
    expect(counts.map((c) => c.count)).toEqual([1, 1, 0, 0, 0, 0]);
  });

  it("summarises each job without withdrawn applications, open and busiest first", () => {
    const summaries = jobSummaries(jobs, rows);
    expect(summaries.map((s) => s.job.id)).toEqual(["j1", "j3", "j2"]);
    expect(summaries[0]).toMatchObject({ applicants: 2, averageScore: 75, strongFits: 1 });
    expect(summaries[1]).toMatchObject({ applicants: 2, averageScore: 70 });
  });

  it("has no average without scores and lists the newest first", () => {
    expect(averageOf([])).toBeNull();
    expect(newest(rows, 2).map((r) => r.id)).toEqual(["4", "1"]);
  });

  it("sizes bars against the largest stage", () => {
    const counts = stageCounts(rows);
    expect(barPercent(1, counts)).toBe(100);
    expect(barPercent(0, stageCounts([]))).toBe(0);
  });
});

function detail(id: string, overrides: Partial<ApplicationDetail> = {}): ApplicationDetail {
  return {
    ...makeApplicant({ id }),
    job: { id: "j1", title: "Data Engineer", requirements_version: 1 },
    candidate_id: "c", resume_path: "c/x.pdf", source_type: "pdf", cover_note: null,
    extraction: null,
    ...overrides,
  };
}

describe("comparing candidates", () => {
  it("keeps up to three well-formed, distinct ids from a link", () => {
    expect(parseCompareIds(`${ID_A},nope,${ID_A}, ${ID_B},${ID_C},${ID_D}`)).toEqual([ID_A, ID_B, ID_C]);
    expect(parseCompareIds(null)).toEqual([]);
    expect(compareLink("j1", [ID_A, ID_B])).toBe(`/hr/jobs/j1/compare?ids=${ID_A},${ID_B}`);
  });

  it("lines up requirements across candidates, marking ones a score lacks", () => {
    const other = makeScore({
      breakdown: { ...makeScore().breakdown, requirements: [
        { id: "must-2", category: "must_have", text: "Kubernetes", verdict: "met", evidence: "Ran Kubernetes", unverified: false },
        { id: "nice-1", category: "nice_to_have", text: "dbt", verdict: "partial", evidence: "dbt course", unverified: false },
      ] },
    });
    const rows = requirementRows([detail(ID_A), detail(ID_B, { score: other }), detail(ID_C, { score: null })]);

    expect(rows.map((r) => r.id)).toEqual(["must-1", "must-2", "nice-1"]);
    expect(rows[0].cells.map((c) => c?.verdict ?? null)).toEqual(["met", null, null]);
    expect(rows[1].cells.map((c) => c?.verdict ?? null)).toEqual(["missing", "met", null]);
  });

  it("lists category points and notices scores made against different requirement versions", () => {
    const details = [detail(ID_A), detail(ID_B, { score: makeScore({ requirements_version: 2 }) })];

    expect(categoryRows(details)[0].cells.map((c) => c?.points)).toEqual([53.6, 53.6]);
    expect(hasMixedVersions(details)).toBe(true);
    expect(hasMixedVersions([detail(ID_A), detail(ID_B)])).toBe(false);
    expect(categoryRows([detail(ID_A, { score: null })])).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import {
  applicantsCsv,
  blindRecord,
  candidateLabel,
  filterApplicants,
  isStale,
  isStuck,
  NO_FILTERS,
  sortApplicants,
  stageCounts,
  STUCK_AFTER_MS,
} from "../src/hr/applicants";
import { formatScore } from "../src/labels";
import { fromDraft, isEmpty, lines, scoredCategories, toDraft, weightsProblem } from "../src/hr/requirementsForm";
import { DEFAULT_WEIGHTS, EMPTY_REQUIREMENTS } from "../src/data/types";
import { makeResponse } from "./fixtures";
import { makeApplicant, makeScore } from "./portalFixtures";

const strong = makeApplicant({ id: "strong-0001", full_name: "Asha Verma", score: makeScore({ total: 88, band: "strong", breakdown: { ...makeScore().breakdown, knockouts: [] } }), created_at: "2026-10-03T00:00:00Z" });
const weak = makeApplicant({ id: "weak-0002", full_name: "Ben Ito", stage: "reviewing", score: makeScore({ total: 31, band: "weak" }), created_at: "2026-10-05T00:00:00Z" });
const pending = makeApplicant({ id: "pend-0003", full_name: "Cara Diaz", processing_status: "processing", score: null, created_at: "2026-10-09T00:00:00Z" });
const rows = [weak, pending, strong];

describe("applicant table logic", () => {
  it("labels candidates by name, or by a stable code in blind mode", () => {
    expect(candidateLabel(strong, false)).toBe("Asha Verma");
    expect(candidateLabel(strong, true)).toBe("Candidate STRONG");
  });

  it("filters by name, band, stage and missing must-haves", () => {
    expect(filterApplicants(rows, { ...NO_FILTERS, query: "asha" }, false)).toEqual([strong]);
    expect(filterApplicants(rows, { ...NO_FILTERS, query: "asha" }, true)).toEqual([]);
    expect(filterApplicants(rows, { ...NO_FILTERS, band: "weak" }, false)).toEqual([weak]);
    expect(filterApplicants(rows, { ...NO_FILTERS, band: "unscored" }, false)).toEqual([pending]);
    expect(filterApplicants(rows, { ...NO_FILTERS, stage: "reviewing" }, false)).toEqual([weak]);
    expect(filterApplicants(rows, { ...NO_FILTERS, onlyKnockouts: true }, false)).toEqual([weak]);
  });

  it("sorts by score with unscored last, or by date", () => {
    expect(sortApplicants(rows, "score").map((r) => r.id)).toEqual(["strong-0001", "weak-0002", "pend-0003"]);
    expect(sortApplicants(rows, "newest").map((r) => r.id)).toEqual(["pend-0003", "weak-0002", "strong-0001"]);
    expect(sortApplicants(rows, "oldest").map((r) => r.id)).toEqual(["strong-0001", "weak-0002", "pend-0003"]);
    expect(rows[0]).toBe(weak); // the input is not reordered
  });

  it("counts applications per stage", () => {
    expect(stageCounts(rows)).toMatchObject({ submitted: 2, reviewing: 1, hired: 0 });
  });

  it("marks scores made against older requirements as stale", () => {
    expect(isStale(strong, 2)).toBe(true);
    expect(isStale(strong, 1)).toBe(false);
    expect(isStale(pending, 5)).toBe(false);
  });

  it("exports CSV with quoting and neutralises spreadsheet formulas", () => {
    const tricky = makeApplicant({ full_name: "=HYPERLINK(\"x\")", score: makeScore({ breakdown: { ...makeScore().breakdown, knockouts: ["Go", "Rust"] } }) });

    const csv = applicantsCsv([tricky], false).split("\r\n");

    expect(csv[0]).toBe("Candidate,Score,Fit,Missing must-haves,Stage,Applied");
    expect(csv[1]).toBe(`"'=HYPERLINK(""x"")",72,Possible fit,Go; Rust,Submitted,2026-10-10`);
  });

  it("blind records drop identity and the warnings that would reveal it", () => {
    const result = makeResponse({ warnings: ["No LinkedIn profile", "No education listed"], invalid_fields: ["email"] });

    const blind = blindRecord(result);

    expect(blind.candidate.full_name).toBeNull();
    expect(Object.values(blind.candidate.contact).every((value) => value === null)).toBe(true);
    expect(blind.warnings).toEqual(["No education listed"]);
    expect(blind.invalid_fields).toEqual([]);
  });
});

describe("requirement form", () => {
  it("round-trips requirements through the line-per-item draft", () => {
    const requirements = { ...EMPTY_REQUIREMENTS, must_have: ["SQL", "Python"], min_years: 3, education_level: "master" as const };

    expect(fromDraft(toDraft(requirements))).toEqual({ ok: true, requirements });
  });

  it("splits lines, trimming blanks", () => {
    expect(lines(" SQL \n\n Python\n")).toEqual(["SQL", "Python"]);
  });

  it("refuses impossible years", () => {
    const draft = toDraft(EMPTY_REQUIREMENTS);
    expect(fromDraft({ ...draft, minYears: "abc" }).ok).toBe(false);
    expect(fromDraft({ ...draft, minYears: "41" }).ok).toBe(false);
    expect(fromDraft({ ...draft, minYears: "" })).toEqual({ ok: true, requirements: EMPTY_REQUIREMENTS });
  });

  it("knows when nothing is required", () => {
    expect(isEmpty(EMPTY_REQUIREMENTS)).toBe(true);
    expect(isEmpty({ ...EMPTY_REQUIREMENTS, min_years: 2 })).toBe(false);
  });

  it("checks weights are whole numbers in range and not all zero", () => {
    const sqlOnly = { ...EMPTY_REQUIREMENTS, must_have: ["SQL"] };
    expect(weightsProblem(DEFAULT_WEIGHTS, sqlOnly)).toBeNull();
    expect(weightsProblem({ ...DEFAULT_WEIGHTS, education: 1.5 }, sqlOnly)).toMatch(/whole number/);
    expect(weightsProblem({ must_have: 0, nice_to_have: 0, experience: 0, education: 0, certifications: 0 }, sqlOnly)).toMatch(/above zero/);
  });
});

describe("review fixes", () => {
  it("shows the score at the precision its band was decided on", () => {
    expect(formatScore(74.6)).toBe("74.6");
    expect(formatScore(80)).toBe("80");
  });

  it("treats processing older than five minutes as stuck", () => {
    const started = Date.parse("2026-10-10T09:00:00Z");
    const row = { processing_status: "processing" as const, updated_at: "2026-10-10T09:00:00Z" };
    expect(isStuck(row, started + STUCK_AFTER_MS - 1)).toBe(false);
    expect(isStuck(row, started + STUCK_AFTER_MS + 1)).toBe(true);
    expect(isStuck({ ...row, processing_status: "scored" }, started + STUCK_AFTER_MS * 10)).toBe(false);
  });

  it("removes the candidate's name from free text in blind records", () => {
    const result = makeResponse();
    const named = { ...result, candidate: { ...result.candidate, full_name: "Riya Kulkarni",
      summary: "Riya is a data analyst. KULKARNI built dashboards." } };

    expect(blindRecord(named).candidate.summary).toBe("[candidate] is a data analyst. [candidate] built dashboards.");
  });
});

describe("weights", () => {
  it("refuses weights that zero every category the job asks about", () => {
    const sqlOnly = { ...EMPTY_REQUIREMENTS, must_have: ["SQL"] };
    expect(weightsProblem({ ...DEFAULT_WEIGHTS, must_have: 0 }, sqlOnly)).toMatch(/weight above zero/);
    expect(weightsProblem({ ...DEFAULT_WEIGHTS, experience: 0 }, sqlOnly)).toBeNull();
    expect(scoredCategories({ ...sqlOnly, min_years: 2, education_fields: ["Maths"] })).toEqual(["must_have", "experience", "education"]);
  });
});

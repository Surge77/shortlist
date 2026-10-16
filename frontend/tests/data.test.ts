import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase } from "./fakeSupabase";
import { makeCandidate } from "./fixtures";
import { makeJobRow, makeScore } from "./portalFixtures";

const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof fakeSupabase> | null }));

vi.mock("../src/lib/supabase", () => ({
  get supabase() {
    return fake.current?.client ?? null;
  },
  NOT_CONFIGURED: "not configured",
  accessToken: async () => null,
}));

const { createJob, getJob, listHrJobs, listOpenJobs, saveError, updateJob } = await import("../src/data/jobs");
const applications = await import("../src/data/applications");
const profile = await import("../src/data/profile");

let db: ReturnType<typeof fakeSupabase>;

beforeEach(() => {
  db = fakeSupabase();
  fake.current = db;
});

describe("jobs data", () => {
  it("lists open jobs newest first", async () => {
    db.reply("jobs", { data: [makeJobRow()] });

    const result = await listOpenJobs();

    expect(result).toEqual({ ok: true, data: [makeJobRow()] });
    expect(db.calls[0].steps).toContainEqual(["eq", ["status", "open"]]);
    expect(db.calls[0].steps).toContainEqual(["order", ["created_at", { ascending: false }]]);
  });

  it("turns database errors into friendly messages", async () => {
    db.reply("jobs", { error: { message: "boom" } });
    expect(await getJob("j")).toMatchObject({ ok: false });
    expect(saveError({ message: 'violates check constraint "open_jobs_have_requirements"' })).toMatch(/Approve the requirements/);
    expect(saveError({ message: "other" })).toMatch(/Couldn't save/);
  });

  it("counts applicants per job for HR", async () => {
    db.reply("jobs", { data: [{ ...makeJobRow(), applications: [{ count: 3 }] }, { ...makeJobRow({ id: "j2" }), applications: [] }] });

    const result = await listHrJobs();

    expect(result.ok && result.data.map((job) => job.applicant_count)).toEqual([3, 0]);
  });

  it("creates and updates jobs", async () => {
    db.reply("jobs", { data: { id: "new-job" } });
    db.reply("jobs", {});
    const fields = { title: "Analyst", department: null, location: null, employment_type: "full_time" as const,
      description: "Analyse things carefully every day." };

    expect(await createJob(fields)).toEqual({ ok: true, data: "new-job" });
    expect(await updateJob("new-job", { status: "open" })).toEqual({ ok: true, data: null });
    expect(db.calls[1].steps).toContainEqual(["update", [{ status: "open" }]]);
  });

  it("says so when Supabase is not configured", async () => {
    fake.current = null;
    expect(await listOpenJobs()).toEqual({ ok: false, message: "not configured" });
    expect(await applications.listMyApplications()).toEqual({ ok: false, message: "not configured" });
  });
});

describe("applications data", () => {
  it("accepts one-to-one embeds as an object or a one-item array", () => {
    expect(applications.one([1])).toBe(1);
    expect(applications.one(2)).toBe(2);
    expect(applications.one([])).toBeNull();
    expect(applications.one(null)).toBeNull();
  });

  it("flattens applicant rows with name and score", async () => {
    db.reply("applications", {
      data: [{ id: "a", stage: "submitted", processing_status: "scored", processing_error: null, created_at: "2026-10-01",
        profiles: { full_name: "Asha" }, scores: [makeScore()] }],
    });

    const result = await applications.listApplicants("job-1");

    expect(result.ok && result.data[0]).toMatchObject({ id: "a", full_name: "Asha", score: makeScore() });
  });

  it("assembles an application's detail", async () => {
    db.reply("applications", {
      data: { id: "a", stage: "reviewing", processing_status: "scored", processing_error: null, created_at: "2026-10-01",
        profiles: null, scores: null, candidate_id: "c", resume_path: "c/a.pdf", source_type: "pdf", cover_note: "Hi",
        jobs: { id: "j", title: "Analyst", requirements_version: 2 },
        extractions: { record: makeCandidate(), experience_months: 12, warnings: [], invalid_fields: [], source_text: null } },
    });

    const result = await applications.getApplicationDetail("a");

    expect(result.ok && result.data).toMatchObject({ full_name: null, score: null, cover_note: "Hi", job: { title: "Analyst" } });
    expect(result.ok && result.data?.extraction?.experience_months).toBe(12);
  });

  it("returns nothing for an unknown application", async () => {
    db.reply("applications", { data: null });
    expect(await applications.getApplicationDetail("missing")).toEqual({ ok: true, data: null });
  });

  it("reads notes with their author and adds new ones", async () => {
    db.reply("notes", { data: [{ id: "n", body: "Good", created_at: "2026-10-02", author: { full_name: "Hana" } }] });
    db.reply("notes", {});

    expect(await applications.listNotes("a")).toEqual({
      ok: true, data: [{ id: "n", body: "Good", created_at: "2026-10-02", author_name: "Hana" }],
    });
    expect(await applications.addNote("a", "Call back")).toEqual({ ok: true, data: null });
    expect(db.calls[1].steps).toContainEqual(["insert", [{ application_id: "a", body: "Call back" }]]);
  });

  it("changes stages through the audited functions", async () => {
    db.reply("rpc:set_application_stage", {});
    db.reply("rpc:withdraw_application", { error: { code: "P0001", message: "This application can no longer be withdrawn" } });
    db.reply("rpc:set_application_stage", { error: { code: "22P02", message: 'invalid input syntax for type uuid: "x"' } });

    expect(await applications.setStage("a", "shortlisted")).toEqual({ ok: true, data: null });
    expect(await applications.withdrawApplication("a")).toEqual({ ok: false, message: "This application can no longer be withdrawn" });
    // Errors the functions didn't raise on purpose never reach the screen verbatim.
    const internal = await applications.setStage("x", "hired");
    expect(internal.ok === false && internal.message).toBe("Couldn't update the application. Reload and try again.");
    expect(db.calls[0].steps[0][1]).toEqual([{ application_id: "a", new_stage: "shortlisted" }]);
  });

  it("lists a candidate's applications, stage history, and signs resume links", async () => {
    db.reply("applications", { data: [{ id: "a", stage: "submitted", created_at: "x", job: null }] });
    db.reply("stage_events", { data: [{ id: 1, from_stage: "submitted", to_stage: "reviewing", created_at: "x" }] });
    db.reply("storage:resumes", { data: { signedUrl: "https://signed.example/a.pdf" } });

    expect((await applications.listMyApplications()).ok).toBe(true);
    expect((await applications.listStageEvents("a")).ok).toBe(true);
    expect(await applications.resumeUrl("c/a.pdf")).toEqual({ ok: true, data: "https://signed.example/a.pdf" });
    expect(db.calls[2].steps[0][1]).toEqual(["c/a.pdf", 300]);
  });
});

describe("profile data", () => {
  it("reads only the signed-in candidate's name and saved resume", async () => {
    const row = { full_name: "Riya", resume_path: "c1/profile-demo.pdf", resume_filename: "cv.pdf", resume_updated_at: null };
    db.reply("profiles", { data: row });

    expect(await profile.getMyProfile("c1")).toEqual({ ok: true, data: row });
    expect(db.calls[0].steps).toContainEqual(["eq", ["id", "c1"]]);
  });

  it("renames through the one column the browser may write", async () => {
    db.reply("profiles", {});
    db.reply("profiles", { error: { message: "permission denied" } });

    expect(await profile.renameMe("c1", "Riya K.")).toEqual({ ok: true, data: null });
    expect(db.calls[0].steps).toContainEqual(["update", [{ full_name: "Riya K." }]]);
    expect(await profile.renameMe("c1", "x")).toEqual({ ok: false, message: "Couldn't save your name. Try again." });
    db.reply("profiles", { error: { message: "boom" } });
    expect(await profile.getMyProfile("c1")).toMatchObject({ ok: false });
  });
});

describe("overview data", () => {
  it("flattens each application's name and score headline, newest first and capped", async () => {
    db.reply("applications", { data: [
      { id: "a1", job_id: "j1", stage: "submitted", processing_status: "scored", created_at: "2026-10-10T00:00:00Z",
        profiles: { full_name: "Asha" }, scores: [{ total: 80, band: "strong" }] },
      { id: "a2", job_id: "j1", stage: "reviewing", processing_status: "failed", created_at: "2026-10-09T00:00:00Z",
        profiles: null, scores: null },
    ] });

    const result = await applications.listAllApplications();

    expect(result).toEqual({ ok: true, data: [
      { id: "a1", job_id: "j1", stage: "submitted", processing_status: "scored", created_at: "2026-10-10T00:00:00Z",
        full_name: "Asha", score: { total: 80, band: "strong" } },
      { id: "a2", job_id: "j1", stage: "reviewing", processing_status: "failed", created_at: "2026-10-09T00:00:00Z",
        full_name: null, score: null },
    ] });
    expect(db.calls[0].steps).toContainEqual(["limit", [applications.OVERVIEW_LIMIT]]);
  });
});

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../src/api";
import { App } from "../src/App";
import * as authModule from "../src/auth/AuthProvider";
import * as applications from "../src/data/applications";
import * as jobs from "../src/data/jobs";
import { makeCandidate } from "./fixtures";
import { makeApplicant, makeJobRow, makeScore } from "./portalFixtures";

vi.mock("../src/api");
vi.mock("../src/data/jobs");
vi.mock("../src/data/applications", async (original) => ({
  ...Object.fromEntries(Object.keys(await original<typeof applications>()).map((key) => [key, vi.fn()])),
}));
vi.mock("../src/auth/AuthProvider", async (original) => ({
  ...(await original<typeof authModule>()),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: vi.fn(),
}));

function visit(path: string) {
  window.history.replaceState(null, "", path);
  return render(<App />);
}

beforeEach(() => {
  vi.mocked(authModule.useAuth).mockReturnValue({
    auth: { status: "signedIn", userId: "h", email: "hr@example.com", role: "hr", fullName: "Hana" },
    signIn: vi.fn(), signInWithEmail: vi.fn(), signUp: vi.fn(), signOut: vi.fn(),
  });
  localStorage.clear();
});

afterEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("HR jobs", () => {
  it("lists every job with its status, applicants and requirement version", async () => {
    vi.mocked(jobs.listHrJobs).mockResolvedValue({
      ok: true,
      data: [
        { ...makeJobRow({ id: "j1" }), applicant_count: 4 },
        { ...makeJobRow({ id: "j2", title: "Draft Role", status: "draft", requirements: null }), applicant_count: 0 },
      ],
    });

    visit("/hr/jobs");

    const rows = await screen.findAllByRole("row");
    expect(within(rows[1]).getByRole("link", { name: "Data Engineer" })).toHaveAttribute("href", "/hr/jobs/j1");
    expect(within(rows[1]).getByText("Version 1")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Not approved")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New job" })).toHaveAttribute("href", "/hr/jobs/new");
  });
});

describe("applicants", () => {
  const strong = makeApplicant({ id: "s0000001", full_name: "Asha Verma", score: makeScore({ total: 90, band: "strong", requirements_version: 2, breakdown: { ...makeScore().breakdown, knockouts: [] } }) });
  const weak = makeApplicant({ id: "w0000002", full_name: "Ben Ito", stage: "reviewing", score: makeScore({ total: 30, band: "weak" }) });
  const failed = makeApplicant({ id: "f0000003", full_name: "Cara Diaz", processing_status: "failed", processing_error: "Not a resume", score: null });

  beforeEach(() => {
    vi.mocked(jobs.getJob).mockResolvedValue({ ok: true, data: makeJobRow({ id: "j1", requirements_version: 2 }) });
    vi.mocked(applications.listApplicants).mockResolvedValue({ ok: true, data: [weak, failed, strong] });
  });

  it("ranks applicants by score with stage counts, knockouts and stale scores", async () => {
    visit("/hr/jobs/j1");

    const rows = await screen.findAllByRole("row");
    expect(rows.slice(1).map((row) => within(row).getAllByRole("link")[0].textContent)).toEqual(["Asha Verma", "Ben Ito", "Cara Diaz"]);
    expect(within(rows[3]).getByText("Failed")).toHaveAttribute("title", "Not a resume");
    expect(within(rows[2]).getByText("Old version")).toBeInTheDocument();
    expect(screen.getByText(/1 score was made against older requirements/)).toBeInTheDocument();
    expect(within(screen.getByLabelText("Applications by stage")).getByText("Under review").nextSibling).toHaveTextContent("1");
  });

  it("filters, hides names in blind review, and remembers the choice", async () => {
    const user = userEvent.setup();
    visit("/hr/jobs/j1");
    await screen.findByRole("link", { name: "Asha Verma" });

    await user.click(screen.getByLabelText("Missing a must-have"));
    expect(screen.getByText(/^Showing 1 of 3\./)).toBeInTheDocument();
    await user.click(screen.getByLabelText("Missing a must-have"));

    await user.selectOptions(screen.getByLabelText("Fit"), "unscored");
    expect(screen.getByRole("link", { name: "Cara Diaz" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Fit"), "all");

    await user.click(screen.getByLabelText("Blind review"));
    expect(screen.queryByText("Asha Verma")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Candidate S00000" })).toBeInTheDocument();
    expect(localStorage.getItem("shortlist-blind-review")).toBe("on");
  });

  it("exports the visible rows as CSV", async () => {
    const createObjectURL = vi.fn(() => "blob:csv");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const user = userEvent.setup();

    visit("/hr/jobs/j1");
    await user.click(await screen.findByRole("button", { name: "Export CSV" }));

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });
});

describe("application review", () => {
  const detail = {
    ...makeApplicant({ id: "app1", stage: "reviewing" as const }),
    job: { id: "j1", title: "Data Engineer", requirements_version: 2 },
    candidate_id: "c1", resume_path: "c1/app1.pdf", source_type: "pdf" as const, cover_note: "Keen to join",
    extraction: { record: makeCandidate(), experience_months: 64, warnings: ["No LinkedIn profile"], invalid_fields: [], source_text: null },
  };

  beforeEach(() => {
    vi.mocked(applications.getApplicationDetail).mockResolvedValue({ ok: true, data: detail });
    vi.mocked(applications.listNotes).mockResolvedValue({ ok: true, data: [{ id: "n1", body: "Strong SQL", created_at: "2026-10-06T00:00:00Z", author_name: "Hana" }] });
    vi.mocked(applications.listStageEvents).mockResolvedValue({ ok: true, data: [{ id: 1, from_stage: "submitted", to_stage: "reviewing", created_at: "2026-10-06T00:00:00Z" }] });
  });

  it("shows the score beside the record, with notes, history and the cover note", async () => {
    visit("/hr/applications/app1");

    expect(await screen.findByRole("heading", { name: "Riya Kulkarni", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fit score" })).toBeInTheDocument();
    expect(screen.getByText("Scored against an older version of the requirements.")).toBeInTheDocument();
    expect(await screen.findByText("Strong SQL")).toBeInTheDocument();
    expect(screen.getByText(/Submitted → Under review/)).toBeInTheDocument();
    expect(screen.getByText("Keen to join")).toBeInTheDocument();
  });

  it("moves the stage, adds a note, rescores and opens the original", async () => {
    vi.mocked(applications.setStage).mockResolvedValue({ ok: true, data: null });
    vi.mocked(applications.addNote).mockResolvedValue({ ok: true, data: null });
    vi.mocked(api.rescoreApplication).mockResolvedValue({ ok: true, data: { queued: 1 } });
    vi.mocked(applications.resumeUrl).mockResolvedValue({ ok: true, data: "https://signed.example/a.pdf" });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    visit("/hr/applications/app1");

    await user.selectOptions(await screen.findByLabelText("Stage"), "shortlisted");
    expect(applications.setStage).toHaveBeenCalledWith("app1", "shortlisted");

    await user.type(screen.getByLabelText("New note"), "Book an interview");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    expect(applications.addNote).toHaveBeenCalledWith("app1", "Book an interview");

    await user.click(screen.getByRole("button", { name: "Rescore" }));
    expect(api.rescoreApplication).toHaveBeenCalledWith("app1");

    await user.click(screen.getByRole("button", { name: "Open the original resume" }));
    expect(open).toHaveBeenCalledWith("https://signed.example/a.pdf", "_blank", "noopener,noreferrer");
    open.mockRestore();
  });

  it("hides identity in blind review and explains failures", async () => {
    localStorage.setItem("shortlist-blind-review", "on");
    vi.mocked(applications.getApplicationDetail).mockResolvedValue({
      ok: true, data: { ...detail, processing_status: "failed", processing_error: "This file doesn't look like a resume.", score: null },
    });

    visit("/hr/applications/app1");

    expect(await screen.findByRole("heading", { name: "Candidate APP1", level: 1 })).toBeInTheDocument();
    expect(screen.queryByText("riya.kulkarni@example.com")).not.toBeInTheDocument();
    expect(screen.getByText("Scoring failed")).toBeInTheDocument();
    expect(screen.getByText("This file doesn't look like a resume.")).toBeInTheDocument();
    expect(screen.getByText("Hidden in blind review.")).toBeInTheDocument();
    // Let the notes panel finish loading before cleanup resets the mocks it calls.
    expect(await screen.findByText("Strong SQL")).toBeInTheDocument();
  });
});

describe("job editor", () => {
  it("creates a draft job and opens it for editing", async () => {
    vi.mocked(jobs.createJob).mockResolvedValue({ ok: true, data: "new-id" });
    vi.mocked(jobs.getJob).mockResolvedValue({ ok: true, data: makeJobRow({ id: "new-id", status: "draft", requirements: null }) });
    const user = userEvent.setup();
    visit("/hr/jobs/new");

    await user.click(await screen.findByRole("button", { name: "Create draft job" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give the job a title.");

    await user.type(screen.getByLabelText("Title"), "Data Engineer");
    await user.type(screen.getByLabelText("Description"), "Build and maintain data pipelines.");
    await user.click(screen.getByRole("button", { name: "Create draft job" }));

    expect(jobs.createJob).toHaveBeenCalledWith(expect.objectContaining({ title: "Data Engineer", department: null }));
    expect(window.location.pathname).toBe("/hr/jobs/new-id/edit");
  });

  it("drafts requirements from the description, approves them and publishes", async () => {
    const draftJob = makeJobRow({ id: "j1", status: "draft", requirements: null, weights: null });
    vi.mocked(jobs.getJob).mockResolvedValue({ ok: true, data: draftJob });
    vi.mocked(api.draftRequirements).mockResolvedValue({ ok: true, data: { ...makeJobRow().requirements!, must_have: ["Python", "Airflow"] } });
    vi.mocked(api.saveRequirements).mockResolvedValue({ ok: true, data: { requirements_version: 1 } });
    vi.mocked(jobs.updateJob).mockResolvedValue({ ok: false, message: "Approve the requirements before publishing the job." });
    const user = userEvent.setup();
    visit("/hr/jobs/j1/edit");

    await user.click(await screen.findByRole("button", { name: "Draft from description" }));
    expect(api.draftRequirements).toHaveBeenCalledWith(draftJob.description);
    expect(screen.getByLabelText("Must-have skills")).toHaveValue("Python\nAirflow");

    await user.click(screen.getByRole("button", { name: "Approve requirements" }));
    expect(api.saveRequirements).toHaveBeenCalledWith("j1", expect.objectContaining({ must_have: ["Python", "Airflow"] }),
      expect.objectContaining({ must_have: 50 }));
    expect(await screen.findByText("Approved as version 1.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(jobs.updateJob).toHaveBeenCalledWith("j1", { status: "open" });
    expect(await screen.findByText("Approve the requirements before publishing the job.")).toBeInTheDocument();
  });

  it("refuses empty requirements and offers rescoring once approved", async () => {
    vi.mocked(jobs.getJob).mockResolvedValue({ ok: true, data: makeJobRow({ id: "j1" }) });
    vi.mocked(api.rescoreJob).mockResolvedValue({ ok: true, data: { queued: 3 } });
    const user = userEvent.setup();
    visit("/hr/jobs/j1/edit");

    await user.click(await screen.findByRole("button", { name: "Rescore all applications" }));
    expect(await screen.findByText("Rescoring 3 applications in the background.")).toBeInTheDocument();

    for (const label of ["Must-have skills", "Nice-to-have skills", "Fields of study", "Minimum years of experience"]) {
      await user.clear(screen.getByLabelText(label));
    }
    await user.selectOptions(screen.getByLabelText("Minimum education"), "");
    await user.click(screen.getByRole("button", { name: "Approve requirements" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Add at least one requirement.");
    expect(api.saveRequirements).not.toHaveBeenCalled();
  });
});

describe("HR overview", () => {
  const overviewRows = [
    { id: "o1", job_id: "j1", stage: "submitted" as const, processing_status: "scored" as const,
      created_at: "2026-10-12T00:00:00Z", full_name: "Asha Verma", score: { total: 88, band: "strong" as const } },
    { id: "o2", job_id: "j1", stage: "hired" as const, processing_status: "scored" as const,
      created_at: "2026-10-11T00:00:00Z", full_name: "Ben Ito", score: { total: 64, band: "possible" as const } },
  ];

  beforeEach(() => {
    vi.mocked(jobs.listHrJobs).mockResolvedValue({ ok: true, data: [{ ...makeJobRow({ id: "j1" }), applicant_count: 2 }] });
    vi.mocked(applications.listAllApplications).mockResolvedValue({ ok: true, data: overviewRows });
  });

  it("shows headline counts, the stage funnel, newest applications and each job's average", async () => {
    vi.mocked(api.getAuthOptions).mockResolvedValue({ ok: true, data: { demo: false, hr_email: null, candidate_email: null } });
    visit("/hr");

    const glance = await screen.findByLabelText("Hiring at a glance");
    expect(within(glance).getByText("Waiting for review").nextElementSibling).toHaveTextContent("1");
    expect(within(glance).getByText("Hired").nextElementSibling).toHaveTextContent("1");
    expect(screen.getByTitle("Hired: 1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Asha Verma" })).toHaveAttribute("href", "/hr/applications/o1");
    const jobRow = screen.getByRole("link", { name: "Data Engineer" }).closest("tr");
    expect(jobRow).not.toBeNull();
    expect(within(jobRow as HTMLElement).getByText("76")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reset demo data/ })).not.toBeInTheDocument();
  });

  it("resets the demo after an on-page confirmation and reports what it removed", async () => {
    vi.mocked(api.getAuthOptions).mockResolvedValue({ ok: true, data: { demo: true, hr_email: "hr@example.com", candidate_email: null } });
    vi.mocked(api.resetDemo).mockResolvedValue({
      ok: true, data: { deleted_applications: 3, deleted_jobs: 1, deleted_accounts: 2, rescoring: 0 },
    });
    const user = userEvent.setup();
    visit("/hr");

    await user.click(await screen.findByRole("button", { name: "Reset demo data…" }));
    expect(api.resetDemo).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Reset demo data" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Removed 3 applications, 1 jobs and 2 accounts.");
    expect(jobs.listHrJobs).toHaveBeenCalledTimes(2);
  });

  it("cancels a reset without calling the server", async () => {
    vi.mocked(api.getAuthOptions).mockResolvedValue({ ok: true, data: { demo: true, hr_email: null, candidate_email: null } });
    const user = userEvent.setup();
    visit("/hr");

    await user.click(await screen.findByRole("button", { name: "Reset demo data…" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(api.resetDemo).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Reset demo data…" })).toBeInTheDocument();
  });
});

describe("compare", () => {
  const A = "a1b2c3d4-0000-4000-8000-00000000000a";
  const B = "a1b2c3d4-0000-4000-8000-00000000000b";
  const detailFor = (id: string, name: string, total: number) => ({
    ...makeApplicant({ id, full_name: name, score: makeScore({ total }) }),
    job: { id: "j1", title: "Data Engineer", requirements_version: 1 },
    candidate_id: "c", resume_path: "c/x.pdf", source_type: "pdf" as const, cover_note: null,
    extraction: { record: makeCandidate(), experience_months: 30, warnings: [], invalid_fields: [], source_text: null },
  });

  it("selects two applicants from the list and compares them requirement by requirement", async () => {
    vi.mocked(jobs.getJob).mockResolvedValue({ ok: true, data: makeJobRow({ id: "j1" }) });
    vi.mocked(applications.listApplicants).mockResolvedValue({ ok: true, data: [
      makeApplicant({ id: A, full_name: "Asha Verma" }), makeApplicant({ id: B, full_name: "Ben Ito" }),
    ] });
    vi.mocked(applications.getApplicationDetail).mockImplementation(async (id) => ({
      ok: true, data: id === A ? detailFor(A, "Asha Verma", 81) : detailFor(B, "Ben Ito", 55),
    }));
    const user = userEvent.setup();
    visit("/hr/jobs/j1");

    const compare = await screen.findByRole("button", { name: "Compare selected (0)" });
    expect(compare).toBeDisabled();
    await user.click(screen.getByLabelText("Compare Asha Verma"));
    await user.click(screen.getByLabelText("Compare Ben Ito"));
    await user.click(screen.getByRole("button", { name: "Compare selected (2)" }));

    expect(window.location.search).toBe(`?ids=${A},${B}`);
    expect(await screen.findByRole("heading", { name: "Compare candidates: Data Engineer" })).toBeInTheDocument();
    const kubernetes = screen.getByRole("rowheader", { name: /Kubernetes/ }).closest("tr") as HTMLElement;
    expect(within(kubernetes).getAllByText("Missing")).toHaveLength(2);
    expect(screen.getAllByText("2 yrs 6 mos")).toHaveLength(2);
    expect(screen.getByText("81")).toBeInTheDocument();
  });

  it("explains what to do when fewer than two applications can be compared", async () => {
    vi.mocked(applications.getApplicationDetail).mockResolvedValue({ ok: true, data: null });
    visit(`/hr/jobs/j1/compare?ids=${A}`);

    expect(await screen.findByText(/Choose two or three applicants/)).toBeInTheDocument();
  });
});

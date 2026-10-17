import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../src/api";
import * as authModule from "../src/auth/AuthProvider";
import { ApplyForm } from "../src/components/ApplyForm";
import { RequireRole } from "../src/components/RequireRole";
import { ScorePanel } from "../src/components/ScorePanel";
import * as jobs from "../src/data/jobs";
import * as profile from "../src/data/profile";
import { safeNext } from "../src/pages/AuthPage";
import { fieldsProblem } from "../src/pages/hr/JobEditor";
import { toExtractResponse } from "../src/pages/hr/ApplicationReview";
import { distinctValues, filterJobs, JobBoard, jobMeta, NO_JOB_FILTERS } from "../src/pages/JobBoard";
import { makeCandidate } from "./fixtures";
import { makeApplicant, makeJobRow, makeScore } from "./portalFixtures";

vi.mock("../src/api");
vi.mock("../src/data/jobs");
vi.mock("../src/data/profile");
vi.mock("../src/auth/AuthProvider", async (original) => ({
  ...(await original<typeof authModule>()),
  useAuth: vi.fn(),
}));

function signedInAs(auth: authModule.AuthState) {
  vi.mocked(authModule.useAuth).mockReturnValue({
    auth,
    signIn: vi.fn(),
    signInWithEmail: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  });
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("ScorePanel", () => {
  it("shows the total, how it adds up, each verdict with its evidence, and what to check", () => {
    render(<ScorePanel score={makeScore()} />);

    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("Possible fit")).toBeInTheDocument();
    expect(screen.getByText("53.6 / 71.4")).toBeInTheDocument();
    expect(screen.getByText("Wrote SQL reports")).toBeInTheDocument();
    expect(screen.getByText("(claimed evidence not found in the resume)")).toBeInTheDocument();
    const checks = screen.getByRole("list", { name: "Check these" });
    expect(within(checks).getByText(/Kubernetes/)).toBeInTheDocument();
    expect(screen.getByText(/not an automatic rejection/)).toBeInTheDocument();
  });

  it("explains a missing score", () => {
    render(<ScorePanel score={makeScore({ total: null, band: null })} />);
    expect(screen.getByText(/no requirements to score against/)).toBeInTheDocument();
  });
});

describe("RequireRole", () => {
  it.each<[authModule.AuthState, RegExp]>([
    [{ status: "loading" }, /Checking your account/],
    [{ status: "signedOut" }, /Sign in to see this page/],
    [{ status: "unconfigured" }, /isn't connected to Supabase/],
    [{ status: "signedIn", userId: "u", email: "c@example.com", role: "candidate", fullName: null }, /for HR accounts/],
  ])("guards HR pages (%o)", (auth, message) => {
    signedInAs(auth);
    render(<RequireRole role="hr" path="/hr"><p>secret</p></RequireRole>);
    expect(screen.getByRole("status")).toHaveTextContent(message);
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });

  it("sends signed-out visitors to sign in and back", () => {
    signedInAs({ status: "signedOut" });
    render(<RequireRole role="hr" path="/hr/jobs/1"><p>secret</p></RequireRole>);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?next=%2Fhr%2Fjobs%2F1");
  });

  it("shows the page to the right role", () => {
    signedInAs({ status: "signedIn", userId: "u", email: "hr@example.com", role: "hr", fullName: "Hana" });
    render(<RequireRole role="hr" path="/hr"><p>secret</p></RequireRole>);
    expect(screen.getByText("secret")).toBeInTheDocument();
  });
});

describe("JobBoard", () => {
  const jobsList = [
    makeJobRow({ id: "j1", title: "Data Engineer", location: "Pune" }),
    makeJobRow({ id: "j2", title: "Design Intern", location: "Remote", employment_type: "internship", department: null }),
  ];

  it("describes a job in one line", () => {
    expect(jobMeta(jobsList[1])).toBe("Remote · Internship");
  });

  it("filters by text and type", () => {
    expect(filterJobs(jobsList, { ...NO_JOB_FILTERS, query: "pune" }).map((j) => j.id)).toEqual(["j1"]);
    expect(filterJobs(jobsList, { ...NO_JOB_FILTERS, type: "internship" }).map((j) => j.id)).toEqual(["j2"]);
    expect(filterJobs(jobsList, NO_JOB_FILTERS)).toHaveLength(2);
  });

  it("filters by team and location, and offers only the values the jobs have", () => {
    const withTeams = [...jobsList, makeJobRow({ id: "j3", title: "Analyst", location: "Pune", department: "Analytics" })];

    expect(filterJobs(withTeams, { ...NO_JOB_FILTERS, location: "Pune" }).map((j) => j.id)).toEqual(["j1", "j3"]);
    expect(filterJobs(withTeams, { ...NO_JOB_FILTERS, department: "Analytics" }).map((j) => j.id)).toEqual(["j1", "j3"]);
    expect(distinctValues(withTeams, "location")).toEqual(["Pune", "Remote"]);
    expect(distinctValues(withTeams, "department")).not.toContain(null);
  });

  it("lists open jobs and narrows them as you type", async () => {
    vi.mocked(jobs.listOpenJobs).mockResolvedValue({ ok: true, data: jobsList });
    const user = userEvent.setup();
    render(<JobBoard />);

    expect(await screen.findByRole("link", { name: "Data Engineer" })).toHaveAttribute("href", "/jobs/j1");
    await user.type(screen.getByRole("searchbox"), "remote");

    expect(screen.queryByRole("link", { name: "Data Engineer" })).not.toBeInTheDocument();
    expect(screen.getByText("1 of 2 open roles")).toBeInTheDocument();
  });

  it("says when loading failed", async () => {
    vi.mocked(jobs.listOpenJobs).mockResolvedValue({ ok: false, message: "Couldn't load this." });
    render(<JobBoard />);
    expect(await screen.findByText("Couldn't load this.")).toBeInTheDocument();
  });
});

describe("ApplyForm", () => {
  const CANDIDATE = { status: "signedIn", userId: "c1", email: "c@example.com", role: "candidate", fullName: "Riya" } as const;

  function withSavedResume(filename: string | null) {
    signedInAs(CANDIDATE);
    vi.mocked(profile.getMyProfile).mockResolvedValue({
      ok: true,
      data: { full_name: "Riya", resume_path: filename ? `c1/profile-1.pdf` : null, resume_filename: filename,
        resume_updated_at: null },
    });
  }

  beforeEach(() => withSavedResume(null));

  it("applies with the saved resume by default when there is one", async () => {
    withSavedResume("Riya resume.pdf");
    vi.mocked(api.quickApply).mockResolvedValue({ ok: true, data: { id: "app-2" } });
    const user = userEvent.setup();
    render(<ApplyForm jobId="job-1" />);

    expect(await screen.findByLabelText("Use my saved resume (Riya resume.pdf)")).toBeChecked();
    expect(screen.queryByLabelText("Resume file")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send application" }));

    expect(api.quickApply).toHaveBeenCalledWith("job-1", "");
    expect(await screen.findByText("Application sent.")).toBeInTheDocument();
  });

  it("can switch from the saved resume to a different file", async () => {
    withSavedResume("Riya resume.pdf");
    vi.mocked(api.applyToJob).mockResolvedValue({ ok: true, data: { id: "app-3" } });
    const user = userEvent.setup();
    render(<ApplyForm jobId="job-1" />);

    await user.click(await screen.findByLabelText("Upload a different file"));
    const resume = new File(["%PDF"], "other.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Resume file"), resume);
    await user.click(screen.getByRole("button", { name: "Send application" }));

    expect(api.applyToJob).toHaveBeenCalledWith("job-1", resume, "");
    expect(api.quickApply).not.toHaveBeenCalled();
  });

  it("asks for a file, refuses the wrong type, then sends a good one", async () => {
    vi.mocked(api.applyToJob).mockResolvedValue({ ok: true, data: { id: "app-1" } });
    const user = userEvent.setup({ applyAccept: false });
    render(<ApplyForm jobId="job-1" />);

    await user.click(screen.getByRole("button", { name: "Send application" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose your resume file.");

    const input = screen.getByLabelText("Resume");
    await user.upload(input, new File(["x"], "virus.exe"));
    await user.click(screen.getByRole("button", { name: "Send application" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Upload a PDF/);

    const resume = new File(["%PDF-1.7"], "cv.pdf", { type: "application/pdf" });
    await user.upload(input, resume);
    await user.type(screen.getByLabelText("Cover note (optional)"), "Keen to join");
    await user.click(screen.getByRole("button", { name: "Send application" }));

    expect(api.applyToJob).toHaveBeenCalledWith("job-1", resume, "Keen to join");
    expect(await screen.findByText("Application sent.")).toBeInTheDocument();
  });

  it("shows the server's reason when applying fails", async () => {
    vi.mocked(api.applyToJob).mockResolvedValue({ ok: false, message: "You've already applied to this job." });
    const user = userEvent.setup();
    render(<ApplyForm jobId="job-1" />);

    await user.upload(screen.getByLabelText("Resume"), new File(["%PDF"], "cv.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Send application" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You've already applied to this job.");
  });
});

describe("small rules", () => {
  it.each([
    ["/hr/jobs/1", "/hr/jobs/1"],
    ["//evil.example", null],
    ["/\\evil.example", null],
    ["https://evil.example", null],
    [null, null],
  ])("only follows same-site next paths (%s)", (next, expected) => {
    expect(safeNext(next)).toBe(expected);
  });

  it("requires a title and a real description for a job", () => {
    const fields = { title: "Data Engineer", department: null, location: null, employment_type: "full_time" as const,
      description: "Build and maintain data pipelines." };
    expect(fieldsProblem(fields)).toBeNull();
    expect(fieldsProblem({ ...fields, title: "  " })).toMatch(/title/);
    expect(fieldsProblem({ ...fields, description: "short" })).toMatch(/at least 20/);
  });

  it("turns a stored extraction back into the record the galley shows", () => {
    const detail = {
      ...makeApplicant(),
      job: { id: "j", title: "Data Engineer", requirements_version: 1 },
      candidate_id: "c", resume_path: "c/a.pdf", source_type: "pdf" as const, cover_note: null,
      extraction: { record: makeCandidate(), experience_months: 24, warnings: [], invalid_fields: [], source_text: null },
    };
    expect(toExtractResponse(detail)?.source_type).toBe("pdf");
    expect(toExtractResponse({ ...detail, extraction: null })).toBeNull();
  });
});

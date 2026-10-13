import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import * as authModule from "../src/auth/AuthProvider";
import * as applications from "../src/data/applications";
import * as jobs from "../src/data/jobs";
import { navigate } from "../src/router";
import { makeJobRow } from "./portalFixtures";

vi.mock("../src/api");
vi.mock("../src/data/jobs");
vi.mock("../src/data/applications");
vi.mock("../src/auth/AuthProvider", async (original) => ({
  ...(await original<typeof authModule>()),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: vi.fn(),
}));

const CANDIDATE: authModule.AuthState = {
  status: "signedIn", userId: "c1", email: "riya@example.com", role: "candidate", fullName: "Riya Kulkarni",
};
const signIn = vi.fn();
const signUp = vi.fn();
const signOut = vi.fn();

function as(auth: authModule.AuthState) {
  vi.mocked(authModule.useAuth).mockReturnValue({ auth, signIn, signUp, signOut });
}

function visit(path: string) {
  window.history.replaceState(null, "", path);
  return render(<App />);
}

afterEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("job detail", () => {
  it("shows the role and its requirements, and invites signed-out visitors to sign in", async () => {
    as({ status: "signedOut" });
    vi.mocked(jobs.getJob).mockResolvedValue({ ok: true, data: makeJobRow({ id: "j1" }) });

    visit("/jobs/j1");

    expect(await screen.findByRole("heading", { name: "Data Engineer" })).toBeInTheDocument();
    expect(screen.getByText("SQL, Python")).toBeInTheDocument();
    expect(screen.getByText("2+ years")).toBeInTheDocument();
    expect(screen.getByText("Bachelor's degree in Computer Science")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in to apply" })).toHaveAttribute("href", "/login?next=%2Fjobs%2Fj1");
  });

  it("shows a candidate's existing application instead of the form", async () => {
    as(CANDIDATE);
    vi.mocked(jobs.getJob).mockResolvedValue({ ok: true, data: makeJobRow({ id: "j1" }) });
    vi.mocked(applications.listMyApplications).mockResolvedValue({
      ok: true,
      data: [{ id: "a1", stage: "shortlisted", created_at: "2026-10-05T00:00:00Z", job: { id: "j1", title: "Data Engineer", location: null, status: "open" } }],
    });

    visit("/jobs/j1");

    expect(await screen.findByText(/You applied on 5 Oct 2026/)).toBeInTheDocument();
    expect(screen.getByText("Shortlisted")).toBeInTheDocument();
  });

  it("offers the form to a candidate who hasn't applied, and refuses HR and closed jobs", async () => {
    as(CANDIDATE);
    vi.mocked(jobs.getJob).mockResolvedValue({ ok: true, data: makeJobRow({ id: "j1" }) });
    vi.mocked(applications.listMyApplications).mockResolvedValue({ ok: true, data: [] });
    const { unmount } = visit("/jobs/j1");
    expect(await screen.findByRole("button", { name: "Send application" })).toBeInTheDocument();
    unmount();

    as({ ...CANDIDATE, role: "hr" } as authModule.AuthState);
    const second = visit("/jobs/j1");
    expect(await screen.findByText("HR accounts can't apply to jobs.")).toBeInTheDocument();
    second.unmount();

    vi.mocked(jobs.getJob).mockResolvedValue({ ok: true, data: makeJobRow({ id: "j1", status: "closed" }) });
    visit("/jobs/j1");
    expect(await screen.findByText("This job is no longer taking applications.")).toBeInTheDocument();
  });

  it("handles a missing job", async () => {
    as({ status: "signedOut" });
    vi.mocked(jobs.getJob).mockResolvedValue({ ok: true, data: null });
    visit("/jobs/nope");
    expect(await screen.findByText("This job isn't available.")).toBeInTheDocument();
  });
});

describe("my applications", () => {
  it("lists applications with candidate-friendly stages and withdraws in two clicks", async () => {
    as(CANDIDATE);
    vi.mocked(applications.listMyApplications).mockResolvedValue({
      ok: true,
      data: [
        { id: "a1", stage: "submitted", created_at: "2026-10-05T00:00:00Z", job: { id: "j1", title: "Data Engineer", location: null, status: "open" } },
        { id: "a2", stage: "rejected", created_at: "2026-09-01T00:00:00Z", job: null },
      ],
    });
    vi.mocked(applications.withdrawApplication).mockResolvedValue({ ok: true, data: null });
    const user = userEvent.setup();

    visit("/me/applications");

    expect(await screen.findByRole("link", { name: "Data Engineer" })).toBeInTheDocument();
    expect(screen.getByText("Not selected")).toBeInTheDocument();
    expect(screen.getByText("A job that's no longer listed")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Withdraw" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Withdraw" }));
    await user.click(screen.getByRole("button", { name: "Confirm withdraw" }));

    expect(applications.withdrawApplication).toHaveBeenCalledWith("a1");
    expect(applications.listMyApplications).toHaveBeenCalledTimes(2);
  });

  it("is only for candidates", () => {
    as({ status: "signedOut" });
    visit("/me/applications");
    expect(screen.getByRole("status")).toHaveTextContent("Sign in to see this page.");
  });
});

describe("sign in and sign up", () => {
  it("signs in and returns to the page that asked", async () => {
    as({ status: "signedOut" });
    signIn.mockResolvedValue({ ok: true });
    vi.mocked(jobs.listOpenJobs).mockResolvedValue({ ok: true, data: [] });
    const user = userEvent.setup();

    visit("/login?next=%2Fjobs");
    await user.type(screen.getByLabelText("Email"), "riya@example.com");
    await user.type(screen.getByLabelText("Password"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(signIn).toHaveBeenCalledWith("riya@example.com", "correct horse");
    expect(window.location.pathname).toBe("/jobs");
  });

  it("shows why sign-in failed", async () => {
    as({ status: "signedOut" });
    signIn.mockResolvedValue({ ok: false, message: "That email and password don't match an account." });
    const user = userEvent.setup();

    visit("/login");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter your email and password.");

    await user.type(screen.getByLabelText("Email"), "x@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("don't match");
  });

  it("validates signup and then asks the candidate to confirm their email", async () => {
    as({ status: "signedOut" });
    signUp.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    visit("/signup");
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter your name.");

    await user.type(screen.getByLabelText("Full name"), "New Person");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert")).toHaveTextContent("at least 8 characters");

    await user.type(screen.getByLabelText("Password"), "-longer");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(signUp).toHaveBeenCalledWith("new@example.com", "short-longer", "New Person");
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
  });
});

describe("app shell", () => {
  it("shows HR navigation and signs out", async () => {
    as({ status: "signedIn", userId: "h", email: "hr@example.com", role: "hr", fullName: "Hana Recruiter" });
    signOut.mockResolvedValue(undefined);
    vi.mocked(jobs.listOpenJobs).mockResolvedValue({ ok: true, data: [] });
    const user = userEvent.setup();

    visit("/jobs");

    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toHaveTextContent("Jobs & applicants");
    expect(screen.getByRole("link", { name: "Public board" })).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalled();
  });

  it("shows a not-found page for unknown paths and follows navigation", async () => {
    as({ status: "signedOut" });
    vi.mocked(jobs.listOpenJobs).mockResolvedValue({ ok: true, data: [] });

    visit("/nowhere");
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();

    act(() => navigate("/jobs"));
    expect(await screen.findByText("No jobs are open right now. Check back soon.")).toBeInTheDocument();
  });
});

describe("data that depends on who is signed in", () => {
  it("never shows the apply form to a candidate who already applied while their applications load", async () => {
    as({ status: "loading" });
    vi.mocked(jobs.getJob).mockResolvedValue({ ok: true, data: makeJobRow({ id: "j1" }) });
    vi.mocked(applications.listMyApplications).mockResolvedValue({
      ok: true,
      data: [{ id: "a1", stage: "submitted", created_at: "2026-10-05T00:00:00Z", job: { id: "j1", title: "Data Engineer", location: null, status: "open" } }],
    });
    const { rerender } = visit("/jobs/j1");
    await screen.findByRole("heading", { name: "Data Engineer" });

    as(CANDIDATE);
    rerender(<App />);

    expect(screen.queryByRole("button", { name: "Send application" })).not.toBeInTheDocument();
    expect(await screen.findByText(/You applied on/)).toBeInTheDocument();
  });
});

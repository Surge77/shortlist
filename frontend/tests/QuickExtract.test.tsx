import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../src/api";
import { QuickExtract } from "../src/pages/hr/QuickExtract";
import { SAMPLE_RESUME } from "../src/sample";
import { makeCandidate, makeResponse } from "./fixtures";

vi.mock("../src/api");
const extractResume = vi.mocked(api.extractResume);

beforeEach(() => {
  extractResume.mockResolvedValue({ ok: true, data: makeResponse() });
});

afterEach(() => {
  vi.resetAllMocks();
});

async function extractSample() {
  const user = userEvent.setup();
  render(<QuickExtract />);
  await user.click(screen.getByRole("button", { name: "Try a sample resume" }));
  await user.click(screen.getByRole("button", { name: "Extract details" }));
  await screen.findByRole("heading", { name: "Riya Kulkarni" });
  return user;
}

describe("QuickExtract", () => {
  it("extracts the sample resume and shows the candidate's record", async () => {
    await extractSample();

    expect(extractResume).toHaveBeenCalledWith({ kind: "text", text: SAMPLE_RESUME });
    expect(screen.getByRole("heading", { name: "Riya Kulkarni" })).toHaveFocus();
    expect(screen.getByRole("link", { name: "riya.kulkarni@example.com" })).toHaveAttribute(
      "href",
      "mailto:riya.kulkarni@example.com",
    );
    expect(screen.getByText("5 yrs 4 mos")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Timeline from 2021 to/ })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Details ready for Riya Kulkarni.");
  });

  it("only ever links extracted URLs as https, never as the raw value", async () => {
    const candidate = makeCandidate();
    extractResume.mockResolvedValue({
      ok: true,
      data: makeResponse({ candidate: { ...candidate, contact: { ...candidate.contact, portfolio: "javascript:alert(1)" } } }),
    });

    await extractSample();

    expect(screen.getByRole("link", { name: "javascript:alert(1)" })).toHaveAttribute(
      "href",
      "https://javascript:alert(1)",
    );
  });

  it("keeps missing required details printed and stamped instead of dropping them", async () => {
    const candidate = makeCandidate();
    extractResume.mockResolvedValue({
      ok: true,
      data: makeResponse({ candidate: { ...candidate, contact: { ...candidate.contact, phone: null } } }),
    });

    await extractSample();

    expect(screen.getByText("(Phone)").parentElement).toHaveTextContent("Not given (Phone)");
  });

  it("never turns an email carrying mailto parameters into a link", async () => {
    const candidate = makeCandidate();
    const email = "a@b.com?bcc=x%40evil.com";
    extractResume.mockResolvedValue({
      ok: true,
      data: makeResponse({ candidate: { ...candidate, contact: { ...candidate.contact, email } } }),
    });

    await extractSample();

    expect(screen.getByText(email).tagName).not.toBe("A");
  });

  it("does not repeat pasted text as a preview", async () => {
    await extractSample();

    expect(screen.queryByRole("heading", { name: "Original" })).not.toBeInTheDocument();
  });

  it("ignores a file dropped while a resume is being read", () => {
    extractResume.mockReturnValue(new Promise(() => {}));
    render(<QuickExtract />);
    fireEvent.click(screen.getByRole("button", { name: "Try a sample resume" }));
    fireEvent.click(screen.getByRole("button", { name: "Extract details" }));
    fireEvent.click(screen.getByRole("tab", { name: "Upload a file" }));
    const dropped = new File(["%PDF-1.7"], "late.pdf", { type: "application/pdf" });

    fireEvent.drop(screen.getByText("Drop a resume here, or choose a file"), { dataTransfer: { files: [dropped] } });

    expect(screen.queryByText("late.pdf")).not.toBeInTheDocument();
  });

  it("uploads a chosen file", async () => {
    const user = userEvent.setup();
    render(<QuickExtract />);
    const file = new File(["%PDF-1.7"], "riya.pdf", { type: "application/pdf" });

    await user.upload(screen.getByLabelText("Resume file"), file);
    expect(screen.getByText("riya.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Extract details" }));

    expect(extractResume).toHaveBeenCalledWith({ kind: "file", file });
  });

  it("refuses an unsupported file before uploading it", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<QuickExtract />);

    await user.upload(screen.getByLabelText("Resume file"), new File(["x"], "cv.doc"));

    expect(screen.getByRole("alert")).toHaveTextContent("Upload a PDF, Word (.docx), PNG, JPG or WebP file.");
    await user.click(screen.getByRole("button", { name: "Extract details" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a resume file first.");
    expect(extractResume).not.toHaveBeenCalled();
  });

  it("lists what HR should check and marks a malformed email", async () => {
    extractResume.mockResolvedValue({
      ok: true,
      data: makeResponse({ warnings: ["Email address looks malformed", "No LinkedIn profile"], invalid_fields: ["email"] }),
    });

    await extractSample();

    const checks = screen.getByRole("region", { name: "Worth checking" });
    expect(within(checks).getByText("No LinkedIn profile")).toBeInTheDocument();
    // The stamp shows "Check"; its subject is screen-reader text, read as "Check this email".
    expect(screen.getByText("this email").parentElement).toHaveTextContent("Check this email");
  });

  it("notes in the margin when every check passes", async () => {
    await extractSample();

    const checks = screen.getByRole("region", { name: "Checks" });
    expect(checks).toHaveTextContent("Every required detail is present and well formed.");
    expect(screen.queryByRole("region", { name: "Worth checking" })).not.toBeInTheDocument();
  });

  it("tallies the experience as unknown when no role has usable dates", async () => {
    extractResume.mockResolvedValue({ ok: true, data: makeResponse({ experience_months: null }) });

    await extractSample();

    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("The roles have no usable dates.")).toBeInTheDocument();
  });

  it("says so when the document is not a resume", async () => {
    extractResume.mockResolvedValue({ ok: true, data: makeResponse({ candidate: makeCandidate({ is_resume: false }) }) });
    const user = userEvent.setup();
    render(<QuickExtract />);
    await user.click(screen.getByRole("button", { name: "Try a sample resume" }));
    await user.click(screen.getByRole("button", { name: "Extract details" }));

    expect(await screen.findByRole("heading", { name: "This doesn't look like a resume" })).toHaveFocus();
  });

  it("retries the same resume after an error", async () => {
    extractResume.mockResolvedValueOnce({ ok: false, message: "Gemini is unavailable right now." });
    const user = userEvent.setup();
    render(<QuickExtract />);
    await user.click(screen.getByRole("button", { name: "Try a sample resume" }));
    await user.click(screen.getByRole("button", { name: "Extract details" }));

    expect(await screen.findByRole("heading", { name: "Something went wrong" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await screen.findByRole("heading", { name: "Riya Kulkarni" });
    expect(extractResume).toHaveBeenCalledTimes(2);
    expect(extractResume.mock.calls[1][0]).toEqual(extractResume.mock.calls[0][0]);
  });

  it("shows the record as highlighted JSON with copy and download", async () => {
    const user = await extractSample();

    await user.click(screen.getByRole("tab", { name: "JSON" }));

    const json = screen.getByLabelText("Candidate details as JSON");
    expect(json).toHaveTextContent('"full_name": "RIYA KULKARNI"');
    expect(screen.getByRole("button", { name: "Copy JSON" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download JSON" })).toBeInTheDocument();
  });

  it("switches the details view with the arrow keys", async () => {
    const user = await extractSample();
    screen.getByRole("tab", { name: "Profile" }).focus();

    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: "JSON" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "JSON" })).toHaveAttribute("aria-selected", "true");
  });

  it("copies a contact detail", async () => {
    const user = await extractSample();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

    await user.click(screen.getByRole("button", { name: "Copy phone" }));

    expect(writeText).toHaveBeenCalledWith("+91 90000 12345");
    expect(await screen.findAllByRole("button", { name: "Copied" })).toHaveLength(1);
  });

  it("starts over from a clean form", async () => {
    const user = await extractSample();

    await user.click(screen.getByRole("button", { name: "New resume" }));

    expect(screen.getByRole("heading", { name: "The candidate's details appear here" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Upload a file" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("button", { name: "New resume" })).not.toBeInTheDocument();
  });
});

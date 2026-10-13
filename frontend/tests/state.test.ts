import { afterEach, describe, expect, it, vi } from "vitest";

import { errorMessage, extractResume, NETWORK_ERROR, UNEXPECTED_REPLY } from "../src/api";
import { describeStatus, extractorReducer, INITIAL_STATE, type ExtractorState } from "../src/extractorState";
import type { ResumeInput } from "../src/types";
import { makeCandidate, makeResponse } from "./fixtures";

const input: ResumeInput = { kind: "text", text: "RIYA KULKARNI" };

describe("extractorReducer", () => {
  it("moves from idle to extracting when the user submits", () => {
    expect(extractorReducer(INITIAL_STATE, { type: "submitted", input })).toEqual({ kind: "extracting", input });
  });

  it("shows the profile when a resume comes back", () => {
    const extracting: ExtractorState = { kind: "extracting", input };

    const next = extractorReducer(extracting, { type: "extracted", result: makeResponse() });

    expect(next.kind).toBe("done");
  });

  it("stops at notResume when the document is something else", () => {
    const extracting: ExtractorState = { kind: "extracting", input };
    const result = makeResponse({ candidate: makeCandidate({ is_resume: false }) });

    expect(extractorReducer(extracting, { type: "extracted", result }).kind).toBe("notResume");
  });

  it("keeps the input on failure so the same resume can be retried", () => {
    const next = extractorReducer({ kind: "extracting", input }, { type: "failed", message: "Gemini is down" });

    expect(next).toEqual({ kind: "error", input, message: "Gemini is down" });
  });

  it("ignores a result that arrives when nothing is running", () => {
    expect(extractorReducer(INITIAL_STATE, { type: "extracted", result: makeResponse() })).toBe(INITIAL_STATE);
  });

  it("returns to idle on reset", () => {
    expect(extractorReducer({ kind: "error", input, message: "x" }, { type: "reset" })).toBe(INITIAL_STATE);
  });

  it.each<[ExtractorState, string]>([
    [INITIAL_STATE, ""],
    [{ kind: "extracting", input }, "Reading the resume…"],
    [{ kind: "done", input, result: makeResponse() }, "Details ready for Riya Kulkarni."],
    [{ kind: "notResume", input }, "This document doesn't look like a resume."],
    [{ kind: "error", input, message: "Gemini is down" }, "Gemini is down"],
  ])("describes each state for screen readers", (state, expected) => {
    expect(describeStatus(state)).toBe(expected);
  });
});

describe("extractResume", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends pasted text and files as multipart form data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(makeResponse()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["%PDF-1.7"], "cv.pdf", { type: "application/pdf" });

    await extractResume({ kind: "text", text: "RIYA" });
    await extractResume({ kind: "file", file });

    expect((fetchMock.mock.calls[0][1].body as FormData).get("text")).toBe("RIYA");
    expect((fetchMock.mock.calls[1][1].body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("turns server errors, odd replies and network failures into messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Too big" }), { status: 413 })));
    await expect(extractResume(input)).resolves.toEqual({ ok: false, message: "Too big" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 200 })));
    await expect(extractResume(input)).resolves.toEqual({ ok: false, message: UNEXPECTED_REPLY });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    await expect(extractResume(input)).resolves.toEqual({ ok: false, message: UNEXPECTED_REPLY });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(extractResume(input)).resolves.toEqual({ ok: false, message: NETWORK_ERROR });
  });

  it("falls back to a status message for unknown error bodies", () => {
    expect(errorMessage(500, null)).toBe("The server had a problem (500). Try again.");
  });
});

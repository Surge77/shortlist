import { displayName } from "./format";
import type { ExtractResponse, ResumeInput } from "./types";

// Every state but idle remembers the input, so "Try again" resends the same resume.
export type ExtractorState =
  | { kind: "idle" }
  | { kind: "extracting"; input: ResumeInput }
  | { kind: "done"; input: ResumeInput; result: ExtractResponse }
  | { kind: "notResume"; input: ResumeInput }
  | { kind: "error"; input: ResumeInput; message: string };

export type ExtractorAction =
  | { type: "submitted"; input: ResumeInput }
  | { type: "extracted"; result: ExtractResponse }
  | { type: "failed"; message: string }
  | { type: "reset" };

export const INITIAL_STATE: ExtractorState = { kind: "idle" };

export function extractorReducer(state: ExtractorState, action: ExtractorAction): ExtractorState {
  switch (action.type) {
    case "submitted":
      return { kind: "extracting", input: action.input };
    case "extracted":
      if (state.kind !== "extracting") return state;
      if (!action.result.candidate.is_resume) return { kind: "notResume", input: state.input };
      return { kind: "done", input: state.input, result: action.result };
    case "failed":
      if (state.kind !== "extracting") return state;
      return { kind: "error", input: state.input, message: action.message };
    case "reset":
      return INITIAL_STATE;
  }
}

// One short sentence per state for the screen-reader status region.
export function describeStatus(state: ExtractorState): string {
  switch (state.kind) {
    case "idle":
      return "";
    case "extracting":
      return "Reading the resume…";
    case "done":
      return `Details ready for ${displayName(state.result.candidate.full_name)}.`;
    case "notResume":
      return "This document doesn't look like a resume.";
    case "error":
      return state.message;
  }
}

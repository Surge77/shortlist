import { useCallback, useEffect, useReducer, useRef } from "react";

import { extractResume, UNEXPECTED_REPLY } from "./api";
import { extractorReducer, INITIAL_STATE, type ExtractorState } from "./extractorState";
import type { ResumeInput } from "./types";

export interface Extractor {
  state: ExtractorState;
  start: (input: ResumeInput) => void;
  retry: () => void;
  reset: () => void;
}

export function useExtractor(): Extractor {
  const [state, dispatch] = useReducer(extractorReducer, INITIAL_STATE);
  // Every run gets an id; a response for a run the user has replaced (a new resume, a
  // reset, an unmount) is dropped.
  const runId = useRef(0);

  useEffect(() => {
    const current = runId;
    return () => {
      current.current += 1;
    };
  }, []);

  // Started from event handlers rather than effects, so React Strict Mode's double
  // effects in development never send a resume to Gemini twice.
  const run = useCallback(async (input: ResumeInput) => {
    const id = ++runId.current;
    dispatch({ type: "submitted", input });
    try {
      const result = await extractResume(input);
      if (id !== runId.current) return;
      dispatch(result.ok ? { type: "extracted", result: result.data } : { type: "failed", message: result.message });
    } catch {
      // `run` is fired with `void`; a throw here must still end the busy state.
      if (id === runId.current) dispatch({ type: "failed", message: UNEXPECTED_REPLY });
    }
  }, []);

  const start = useCallback((input: ResumeInput) => void run(input), [run]);

  const retry = useCallback(() => {
    if (state.kind === "error") void run(state.input);
  }, [state, run]);

  const reset = useCallback(() => {
    runId.current += 1;
    dispatch({ type: "reset" });
  }, []);

  return { state, start, retry, reset };
}

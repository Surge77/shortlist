import { useEffect, useRef, type ReactNode } from "react";

import type { ExtractorState } from "../extractorState";
import { AlertIcon } from "./icons";
import { ProfileView } from "./ProfileView";

interface ResultViewProps {
  state: ExtractorState;
  onRetry: () => void;
}

// Skeleton widths for the lines being set while Gemini reads, as fractions of the measure.
const SETTING_LINES = ["66%", "40%", "82%", "55%", "74%", "35%"];

// Every state but the finished record is shown on the same blank galley, so the page
// keeps its shape while the record is being set.
function BlankGalley({ children }: { children: ReactNode }) {
  return (
    <div className="galley">
      <div className="gblock">
        <div className="gbody">{children}</div>
      </div>
    </div>
  );
}

// Moves keyboard focus to a message that replaced what the user was looking at.
function FocusHeading({ children }: { children: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h2 ref={ref} tabIndex={-1} className="notice-title">
      {children}
    </h2>
  );
}

export function ResultView({ state, onRetry }: ResultViewProps) {
  switch (state.kind) {
    case "idle":
      return (
        <BlankGalley>
          <div className="gline">
            <div className="gl-wide">
              <h2 className="notice-title">The candidate's details appear here</h2>
              <p className="blank-copy">
                Shortlist reads the resume with Gemini and sets the record out line by line: contact details, career,
                skills and education. Code adds up the total experience from the dates and marks every missing or
                malformed detail in the margin for you to check.
              </p>
            </div>
          </div>
        </BlankGalley>
      );

    case "extracting":
      return (
        <BlankGalley>
          <div className="gline">
            <p className="gl-wide notice-title">Reading the resume…</p>
          </div>
          {SETTING_LINES.map((width, index) => (
            <div key={index} className="gline" aria-hidden="true">
              <div className="gl-wide">
                <span className="skeleton" style={{ width }} />
              </div>
            </div>
          ))}
        </BlankGalley>
      );

    case "done":
      return <ProfileView result={state.result} />;

    case "notResume":
      return (
        <BlankGalley>
          <div className="gline">
            <div className="gl-wide flex gap-3">
              <AlertIcon />
              <div>
                <FocusHeading>This doesn't look like a resume</FocusHeading>
                <p className="mt-1">Gemini found no candidate details in it. Check that you chose the right file.</p>
              </div>
            </div>
          </div>
        </BlankGalley>
      );

    case "error":
      return (
        <BlankGalley>
          <div className="gline">
            <div className="gl-wide flex gap-3">
              <AlertIcon />
              <div>
                <FocusHeading>Something went wrong</FocusHeading>
                <p className="mt-1">{state.message}</p>
                <button type="button" className="btn-outline mt-4" onClick={onRetry}>
                  Try again
                </button>
              </div>
            </div>
          </div>
        </BlankGalley>
      );
  }
}

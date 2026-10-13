import { useId, useRef, useState, type KeyboardEvent } from "react";

import type { ExtractResponse } from "../types";
import { Galley } from "./Galley";
import { JsonView } from "./JsonView";

type View = "profile" | "json";

const VIEWS: ReadonlyArray<{ id: View; label: string }> = [
  { id: "profile", label: "Profile" },
  { id: "json", label: "JSON" },
];

export function ProfileView({ result }: { result: ExtractResponse }) {
  const [view, setView] = useState<View>("profile");
  const tabRefs = useRef<Partial<Record<View, HTMLButtonElement | null>>>({});
  const baseId = useId();

  // WAI-ARIA tabs: only the selected tab is in the Tab order; arrow keys switch.
  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next: View = view === "profile" ? "json" : "profile";
    setView(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div>
      <div className="record-head">
        <h2 className="panel-title mb-0">Candidate record</h2>
        <div role="tablist" aria-label="Details view" className="tab-row">
          {VIEWS.map(({ id, label }) => (
            <button
              key={id}
              ref={(element) => {
                tabRefs.current[id] = element;
              }}
              id={`${baseId}-${id}-tab`}
              type="button"
              role="tab"
              aria-selected={view === id}
              aria-controls={`${baseId}-panel`}
              tabIndex={view === id ? 0 : -1}
              className="tab"
              onClick={() => setView(id)}
              onKeyDown={handleTabKey}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div id={`${baseId}-panel`} role="tabpanel" tabIndex={-1} aria-labelledby={`${baseId}-${view}-tab`}>
        {view === "profile" ? <Galley result={result} /> : <JsonView candidate={result.candidate} />}
      </div>
    </div>
  );
}

import { useState } from "react";

import { getAuthOptions, resetDemo, type ResetResult } from "../api";
import { useLoad } from "../useLoad";

type Phase =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "busy" }
  | { kind: "done"; result: ResetResult }
  | { kind: "failed"; message: string };

function summary(result: ResetResult): string {
  const removed = `Removed ${result.deleted_applications} applications, ${result.deleted_jobs} jobs and ${result.deleted_accounts} accounts.`;
  return result.rescoring > 0 ? `${removed} Rescoring ${result.rescoring} demo applications.` : removed;
}

// Shown only in demo mode. Two steps, on the page itself: a browser confirm() would block
// screen readers' live announcements and looks alarming on a projector.
export function DemoReset({ onReset }: { onReset: () => void }) {
  const { state } = useLoad(getAuthOptions, "auth-options");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  if (state.status !== "ready" || !state.data.demo) return null;

  async function reset() {
    setPhase({ kind: "busy" });
    const result = await resetDemo();
    if (!result.ok) return setPhase({ kind: "failed", message: result.message });
    setPhase({ kind: "done", result: result.data });
    onReset();
  }

  return (
    <section className="sheet" aria-labelledby="demo-reset-heading">
      <h2 id="demo-reset-heading" className="section-title">Demo data</h2>
      {phase.kind === "confirming" ? (
        <div className="grid gap-3">
          <p>
            This deletes every account, job and application added since the demo was seeded, and puts the
            demo applications back as they were. It can't be undone.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn-primary" onClick={() => void reset()}>Reset demo data</button>
            <button type="button" className="btn-outline" onClick={() => setPhase({ kind: "idle" })}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-outline" disabled={phase.kind === "busy"}
            onClick={() => setPhase({ kind: "confirming" })}>
            {phase.kind === "busy" ? "Resetting…" : "Reset demo data…"}
          </button>
          <span className="meta">Use after each presentation.</span>
        </div>
      )}
      {phase.kind === "done" && <p className="meta mt-3" role="status">{summary(phase.result)}</p>}
      {phase.kind === "failed" && <p className="problem mt-3" role="alert">{phase.message}</p>}
    </section>
  );
}

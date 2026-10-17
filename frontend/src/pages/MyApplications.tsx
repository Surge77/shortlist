import { useState } from "react";

import { StageTag } from "../components/Tags";
import { listMyApplications, withdrawApplication } from "../data/applications";
import type { MyApplication } from "../data/types";
import { formatDate, WITHDRAWABLE } from "../labels";
import { Link } from "../router";
import { useLoad } from "../useLoad";

export function MyApplications() {
  const { state, reload } = useLoad(listMyApplications, "my-applications");

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="page-kicker">Your account</p>
          <h1 className="page-title">My applications</h1>
        </div>
      </header>
      {state.status === "loading" && <p className="meta">Loading your applications…</p>}
      {state.status === "error" && <p className="notice notice-error">{state.message}</p>}
      {state.status === "ready" && state.data.length === 0 && (
        <p className="notice">
          You haven't applied to anything yet.{" "}
          <Link to="/jobs" className="link-button">
            Browse open jobs
          </Link>
        </p>
      )}
      {state.status === "ready" && state.data.length > 0 && (
        <ul className="ruled-list">
          {state.data.map((application) => (
            <ApplicationRow key={application.id} application={application} onChanged={reload} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ApplicationRow({ application, onChanged }: { application: MyApplication; onChanged: () => void }) {
  // Withdrawing takes two clicks, so a stray click can't pull an application.
  const [phase, setPhase] = useState<"idle" | "confirming" | "busy">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const canWithdraw = WITHDRAWABLE.includes(application.stage);

  async function withdraw() {
    setPhase("busy");
    const result = await withdrawApplication(application.id);
    if (result.ok) {
      onChanged();
      return;
    }
    setProblem(result.message);
    setPhase("idle");
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-3">
      <div>
        {application.job ? (
          <Link to={`/jobs/${application.job.id}`} className="row-title">
            {application.job.title}
          </Link>
        ) : (
          <span className="row-title">A job that's no longer listed</span>
        )}
        <p className="meta">Applied {formatDate(application.created_at)}</p>
        {problem && <p className="problem" role="alert">{problem}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <StageTag stage={application.stage} forCandidate />
        {canWithdraw && phase === "idle" && (
          <button type="button" className="link-button" onClick={() => setPhase("confirming")}>
            Withdraw
          </button>
        )}
        {canWithdraw && phase !== "idle" && (
          <>
            <button type="button" className="btn-outline" disabled={phase === "busy"} onClick={() => void withdraw()}>
              Confirm withdraw
            </button>
            <button type="button" className="link-button" disabled={phase === "busy"} onClick={() => setPhase("idle")}>
              Keep it
            </button>
          </>
        )}
      </div>
    </li>
  );
}

import { useState } from "react";

import { rescoreApplication } from "../../api";
import { DecisionPanel } from "../../components/DecisionPanel";
import { ProfileView } from "../../components/ProfileView";
import { ScorePanel } from "../../components/ScorePanel";
import { StageTag } from "../../components/Tags";
import { getApplicationDetail, resumeUrl } from "../../data/applications";
import type { ApplicationDetail } from "../../data/types";
import { blindRecord, candidateLabel, isProcessing, isStale, isStuck } from "../../hr/applicants";
import { useBlindMode } from "../../hr/useBlindMode";
import { usePolling } from "../../hr/usePolling";
import { formatDate } from "../../labels";
import { Link } from "../../router";
import type { ExtractResponse } from "../../types";
import { useLoad } from "../../useLoad";

export function toExtractResponse(detail: ApplicationDetail): ExtractResponse | null {
  if (!detail.extraction) return null;
  const { record, experience_months, warnings, invalid_fields, source_text } = detail.extraction;
  return { candidate: record, experience_months, warnings, invalid_fields, source_type: detail.source_type, source_text };
}

export function ApplicationReview({ applicationId }: { applicationId: string }) {
  const { state, reload } = useLoad(() => getApplicationDetail(applicationId), applicationId);
  const [isBlind, setIsBlind] = useBlindMode();
  const isWaiting = state.status === "ready" && !!state.data && isProcessing(state.data) && !isStuck(state.data, Date.now());
  usePolling(isWaiting, reload);

  if (state.status === "loading") return <div className="page meta">Loading application…</div>;
  if (state.status === "error") return <div className="page"><p className="notice notice-error">{state.message}</p></div>;
  if (!state.data) return <div className="page"><p className="notice">That application doesn't exist.</p></div>;
  const detail = state.data;
  const record = toExtractResponse(detail);

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div>
          <p className="page-kicker">
            <Link to={`/hr/jobs/${detail.job.id}`} className="link-button">{detail.job.title}</Link>
          </p>
          <h1 className="page-title">{candidateLabel(detail, isBlind)}</h1>
          <p className="meta mt-1">Applied {formatDate(detail.created_at)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StageTag stage={detail.stage} />
          <label className="check">
            <input type="checkbox" checked={isBlind} onChange={(e) => setIsBlind(e.target.checked)} />
            Blind review
          </label>
        </div>
      </header>
      {/* Always mounted, so screen readers announce when its text changes. */}
      <p role="status" className="sr-only">
        {isProcessing(detail) ? "Scoring the resume." : detail.processing_status === "scored" ? "Score ready." : ""}
      </p>
      <div className="desk desk-embedded">
        <div className="manuscript-column">
          <ScoreArea detail={detail} onRescored={reload} />
          <DecisionPanel applicationId={detail.id} stage={detail.stage} onStageChanged={reload} />
          {detail.cover_note && (
            <section className="sheet">
              <h2 className="section-title">Cover note</h2>
              {/* Free text in the candidate's own words: it usually opens with their name. */}
              {isBlind ? <p className="meta">Hidden in blind review.</p> : <p className="prose">{detail.cover_note}</p>}
            </section>
          )}
        </div>
        <div className="record-panel">
          <OriginalLink path={detail.resume_path} />
          {record ? <ProfileView result={isBlind ? blindRecord(record) : record} /> : (
            <p className="notice">The resume hasn't been read yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ScoreArea({ detail, onRescored }: { detail: ApplicationDetail; onRescored: () => void }) {
  const [problem, setProblem] = useState<string | null>(null);

  async function rescore() {
    const result = await rescoreApplication(detail.id);
    if (!result.ok) return setProblem(result.message);
    setProblem(null);
    onRescored();
  }

  const rescoreButton = (
    <button type="button" className="btn-outline" onClick={() => void rescore()}>Rescore</button>
  );
  if (isProcessing(detail) && isStuck(detail, Date.now())) {
    return (
      <div className="notice notice-error">
        <p className="mb-3">Scoring has been running for over 5 minutes, so it has probably stopped.</p>
        {rescoreButton}
        {problem && <p className="problem" role="alert">{problem}</p>}
      </div>
    );
  }
  if (isProcessing(detail)) {
    return <p className="notice">Reading and scoring the resume… this takes about 20 seconds.</p>;
  }
  return (
    <div className="stack">
      {detail.processing_status === "failed" && (
        <div className="notice notice-error">
          <p className="font-semibold text-ink">Scoring failed</p>
          <p className="mb-3">{detail.processing_error ?? "Something went wrong."}</p>
          {rescoreButton}
        </div>
      )}
      {detail.score && <ScorePanel score={detail.score} />}
      {detail.score && (
        <div className="flex flex-wrap items-center gap-3">
          {rescoreButton}
          {isStale(detail, detail.job.requirements_version) && (
            <span className="meta">Scored against an older version of the requirements.</span>
          )}
        </div>
      )}
      {problem && <p className="problem" role="alert">{problem}</p>}
    </div>
  );
}

function OriginalLink({ path }: { path: string }) {
  const [problem, setProblem] = useState<string | null>(null);

  async function open() {
    const result = await resumeUrl(path);
    if (!result.ok) return setProblem(result.message);
    window.open(result.data, "_blank", "noopener,noreferrer");
  }

  return (
    <p className="mb-3">
      <button type="button" className="link-button" onClick={() => void open()}>Open the original resume</button>
      <span className="meta"> (link valid for 5 minutes)</span>
      {problem && <span className="problem block">{problem}</span>}
    </p>
  );
}

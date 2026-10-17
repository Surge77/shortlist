import type { Band, JobStatus, ProcessingStatus, Score, Stage } from "../data/types";
import { BAND_LABEL, CANDIDATE_STAGE_LABEL, formatScore, JOB_STATUS_LABEL, STAGE_LABEL } from "../labels";

const STAGE_TONE: Record<Stage, string> = {
  submitted: "tag-muted",
  reviewing: "tag-ink",
  shortlisted: "tag-blue",
  hired: "tag-blue",
  rejected: "tag-muted",
  withdrawn: "tag-muted",
};

export function StageTag({ stage, forCandidate = false }: { stage: Stage; forCandidate?: boolean }) {
  const label = forCandidate ? CANDIDATE_STAGE_LABEL[stage] : STAGE_LABEL[stage];
  return <span className={`tag ${STAGE_TONE[stage]}`}>{label}</span>;
}

export function JobStatusTag({ status }: { status: JobStatus }) {
  return <span className={`tag ${status === "open" ? "tag-blue" : "tag-muted"}`}>{JOB_STATUS_LABEL[status]}</span>;
}

const BAND_TONE: Record<Band, string> = { strong: "tag-blue", possible: "tag-ink", weak: "tag-muted" };

export function BandTag({ band }: { band: Band }) {
  return <span className={`tag ${BAND_TONE[band]}`}>{BAND_LABEL[band]}</span>;
}

interface ScoreCellProps {
  status: ProcessingStatus;
  score: Score | null;
  error: string | null;
  isStuck?: boolean;
}

// What the applicant table shows in the score column for each processing state.
export function ScoreCell({ status, score, error, isStuck = false }: ScoreCellProps) {
  if (status === "processing" && isStuck) return <span className="tag tag-red">Stuck: rescore</span>;
  if (status === "processing") return <span className="meta">Scoring…</span>;
  if (status === "failed") return <span className="tag tag-red" title={error ?? undefined}>Failed</span>;
  if (score?.total == null || !score.band) return <span className="meta">No score</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <strong className="text-ink">{formatScore(score.total)}</strong>
      <BandTag band={score.band} />
    </span>
  );
}

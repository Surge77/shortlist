import { useState } from "react";

import { JobStatusTag, ScoreCell, StageTag } from "../../components/Tags";
import { listApplicants } from "../../data/applications";
import { getJob } from "../../data/jobs";
import type { Applicant, Band, Job, Stage } from "../../data/types";
import {
  applicantsCsv,
  candidateLabel,
  filterApplicants,
  isStale,
  isStuck,
  knockoutCount,
  NO_FILTERS,
  sortApplicants,
  stageCounts,
  type ApplicantFilters,
  type SortKey,
} from "../../hr/applicants";
import { compareLink, MAX_COMPARE } from "../../hr/compare";
import { useBlindMode } from "../../hr/useBlindMode";
import { usePolling } from "../../hr/usePolling";
import { BAND_LABEL, formatDate, STAGE_LABEL, STAGES } from "../../labels";
import { Link, navigate } from "../../router";
import { useLoad } from "../../useLoad";

function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function Applicants({ jobId }: { jobId: string }) {
  const job = useLoad(() => getJob(jobId), jobId);
  const applicants = useLoad(() => listApplicants(jobId), jobId);
  const now = Date.now();
  const isWaiting =
    applicants.state.status === "ready" &&
    applicants.state.data.some((a) => a.processing_status === "processing" && !isStuck(a, now));
  usePolling(isWaiting, applicants.reload);

  if (job.state.status === "loading") return <div className="page meta">Loading…</div>;
  if (job.state.status === "error") return <div className="page"><p className="notice notice-error">{job.state.message}</p></div>;
  if (!job.state.data) return <div className="page"><p className="notice">That job doesn't exist.</p></div>;

  return (
    <div className="page page-wide">
      <JobHeader job={job.state.data} />
      {applicants.state.status === "loading" && <p className="meta">Loading applicants…</p>}
      {applicants.state.status === "error" && <p className="notice notice-error">{applicants.state.message}</p>}
      {applicants.state.status === "ready" && <ApplicantTable job={job.state.data} rows={applicants.state.data} />}
    </div>
  );
}

function JobHeader({ job }: { job: Job }) {
  return (
    <header className="page-head">
      <div>
        <p className="page-kicker">
          <Link to="/hr/jobs" className="link-button">All jobs</Link>
        </p>
        <h1 className="page-title">{job.title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <JobStatusTag status={job.status} />
        <Link to={`/hr/jobs/${job.id}/edit`} className="btn-outline">Edit job and requirements</Link>
      </div>
    </header>
  );
}

function ApplicantTable({ job, rows }: { job: Job; rows: Applicant[] }) {
  const [filters, setFilters] = useState<ApplicantFilters>(NO_FILTERS);
  const [sort, setSort] = useState<SortKey>("score");
  const [isBlind, setIsBlind] = useBlindMode();
  const [selected, setSelected] = useState<string[]>([]);
  const counts = stageCounts(rows);
  const visible = sortApplicants(filterApplicants(rows, filters, isBlind), sort);
  const staleCount = rows.filter((row) => isStale(row, job.requirements_version)).length;

  if (rows.length === 0) return <p className="notice">No applications yet.</p>;
  return (
    <>
      <dl className="stat-row" aria-label="Applications by stage">
        {STAGES.filter((stage) => counts[stage] > 0).map((stage) => (
          <div key={stage}>
            <dt className="meta">{STAGE_LABEL[stage]}</dt>
            <dd className="stat-value">{counts[stage]}</dd>
          </div>
        ))}
      </dl>
      {staleCount > 0 && (
        <p className="notice mb-4">
          {staleCount} {staleCount === 1 ? "score was" : "scores were"} made against older requirements.{" "}
          <Link to={`/hr/jobs/${job.id}/edit`} className="link-button">Rescore from the editor</Link>
        </p>
      )}
      <div className="toolbar">
        <label className="field">
          <span className="field-label">Search</span>
          <input className="input" type="search" value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">Fit</span>
          <select className="select" value={filters.band}
            onChange={(e) => setFilters({ ...filters, band: e.target.value as ApplicantFilters["band"] })}>
            <option value="all">All</option>
            {(Object.keys(BAND_LABEL) as Band[]).map((band) => <option key={band} value={band}>{BAND_LABEL[band]}</option>)}
            <option value="unscored">Not scored</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Stage</span>
          <select className="select" value={filters.stage}
            onChange={(e) => setFilters({ ...filters, stage: e.target.value as Stage | "all" })}>
            <option value="all">All</option>
            {STAGES.map((stage) => <option key={stage} value={stage}>{STAGE_LABEL[stage]}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Sort</span>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="score">Highest score</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.onlyKnockouts}
            onChange={(e) => setFilters({ ...filters, onlyKnockouts: e.target.checked })} />
          Missing a must-have
        </label>
        <label className="check">
          <input type="checkbox" checked={isBlind} onChange={(e) => setIsBlind(e.target.checked)} />
          Blind review
        </label>
        <button type="button" className="btn-outline ml-auto" disabled={selected.length < 2}
          onClick={() => navigate(compareLink(job.id, selected))}>
          Compare selected ({selected.length})
        </button>
        <button type="button" className="btn-outline"
          onClick={() => downloadCsv(`${job.title} applicants.csv`, applicantsCsv(visible, isBlind))}>
          Export CSV
        </button>
      </div>
      <p className="meta mb-2" aria-live="polite">
        Showing {visible.length} of {rows.length}. Tick up to {MAX_COMPARE} to compare them side by side.
      </p>
      <div className="ledger-wrap">
        <table className="ledger">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Compare</span></th>
              <th scope="col">Candidate</th>
              <th scope="col">Score</th>
              <th scope="col">Missing must-haves</th>
              <th scope="col">Stage</th>
              <th scope="col">Applied</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                <td>
                  <input type="checkbox" aria-label={`Compare ${candidateLabel(row, isBlind)}`}
                    checked={selected.includes(row.id)}
                    disabled={!selected.includes(row.id) && selected.length >= MAX_COMPARE}
                    onChange={(e) => setSelected(e.target.checked
                      ? [...selected, row.id]
                      : selected.filter((id) => id !== row.id))} />
                </td>
                <td>
                  <Link to={`/hr/applications/${row.id}`} className="row-title">{candidateLabel(row, isBlind)}</Link>
                </td>
                <td>
                  <ScoreCell status={row.processing_status} score={row.score} error={row.processing_error}
                    isStuck={isStuck(row, Date.now())} />
                  {isStale(row, job.requirements_version) && <span className="tag tag-muted ml-2">Old version</span>}
                </td>
                <td>{knockoutCount(row) > 0 ? <span className="tag tag-red">{knockoutCount(row)}</span> : <span className="meta">None</span>}</td>
                <td><StageTag stage={row.stage} /></td>
                <td className="meta">{formatDate(row.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

import { DemoReset } from "../../components/DemoReset";
import { BandTag, JobStatusTag, StageTag } from "../../components/Tags";
import { listAllApplications, OVERVIEW_LIMIT } from "../../data/applications";
import { listHrJobs } from "../../data/jobs";
import type { HrJob } from "../../data/types";
import { candidateLabel } from "../../hr/applicants";
import { barPercent, headline, jobSummaries, newest, stageCounts, type OverviewRow } from "../../hr/dashboard";
import { useBlindMode } from "../../hr/useBlindMode";
import { formatDate, formatScore, STAGE_LABEL } from "../../labels";
import { Link } from "../../router";
import { useLoad } from "../../useLoad";

export function HrDashboard() {
  const jobs = useLoad(listHrJobs, "hr-jobs");
  const rows = useLoad(listAllApplications, "all-applications");
  const reload = () => {
    jobs.reload();
    rows.reload();
  };

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div>
          <p className="page-kicker">HR</p>
          <h1 className="page-title">Overview</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/hr/jobs" className="btn-outline">All jobs</Link>
          <Link to="/hr/jobs/new" className="btn-primary">New job</Link>
        </div>
      </header>
      {(jobs.state.status === "loading" || rows.state.status === "loading") && <p className="meta">Loading…</p>}
      {jobs.state.status === "error" && <p className="notice notice-error">{jobs.state.message}</p>}
      {rows.state.status === "error" && <p className="notice notice-error">{rows.state.message}</p>}
      {jobs.state.status === "ready" && rows.state.status === "ready" && (
        <Overview jobs={jobs.state.data} rows={rows.state.data} />
      )}
      <div className="mt-8">
        <DemoReset onReset={reload} />
      </div>
    </div>
  );
}

function Overview({ jobs, rows }: { jobs: HrJob[]; rows: OverviewRow[] }) {
  const totals = headline(jobs, rows);
  const tiles = [
    { label: "Open jobs", value: totals.openJobs },
    { label: "Applications", value: totals.applications },
    { label: "Waiting for review", value: totals.toReview },
    { label: "Shortlisted", value: totals.shortlisted },
    { label: "Hired", value: totals.hired },
  ];
  return (
    <div className="stack">
      <dl className="stat-row" aria-label="Hiring at a glance">
        {tiles.map((tile) => (
          <div key={tile.label}>
            <dt className="meta">{tile.label}</dt>
            <dd className="stat-value">{tile.value}</dd>
          </div>
        ))}
      </dl>
      {rows.length >= OVERVIEW_LIMIT && (
        <p className="notice">Showing the newest {OVERVIEW_LIMIT.toLocaleString()} applications only.</p>
      )}
      <div className="two-column">
        <StageFunnel rows={rows} />
        <NewestApplications rows={rows} />
      </div>
      <JobTable jobs={jobs} rows={rows} />
    </div>
  );
}

// One series, so no legend: each bar carries its stage name and count as text.
function StageFunnel({ rows }: { rows: OverviewRow[] }) {
  const counts = stageCounts(rows);
  return (
    <section className="sheet" aria-labelledby="funnel-heading">
      <h2 id="funnel-heading" className="section-title">Applications by stage</h2>
      <ul className="funnel">
        {counts.map(({ stage, count }) => (
          <li key={stage} className="funnel-row" title={`${STAGE_LABEL[stage]}: ${count}`}>
            <span className="funnel-label">{STAGE_LABEL[stage]}</span>
            <span className="funnel-track" aria-hidden="true">
              <span className="funnel-bar" style={{ width: `${barPercent(count, counts)}%` }} />
            </span>
            <span className="funnel-count">{count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NewestApplications({ rows }: { rows: OverviewRow[] }) {
  const [isBlind] = useBlindMode();
  const latest = newest(rows);
  return (
    <section className="sheet" aria-labelledby="newest-heading">
      <h2 id="newest-heading" className="section-title">Newest applications</h2>
      {latest.length === 0 ? (
        <p className="meta">No applications yet.</p>
      ) : (
        <ul className="ruled-list">
          {latest.map((row) => (
            <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2">
              <Link to={`/hr/applications/${row.id}`} className="row-title">{candidateLabel(row, isBlind)}</Link>
              <span className="inline-flex items-center gap-2">
                {row.score?.band && <BandTag band={row.score.band} />}
                <StageTag stage={row.stage} />
                <span className="meta">{formatDate(row.created_at)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function JobTable({ jobs, rows }: { jobs: HrJob[]; rows: OverviewRow[] }) {
  return (
    <section aria-labelledby="by-job-heading">
      <h2 id="by-job-heading" className="section-title">By job</h2>
      <div className="ledger-wrap">
        <table className="ledger">
          <thead>
            <tr>
              <th scope="col">Job</th>
              <th scope="col">Status</th>
              <th scope="col">Applicants</th>
              <th scope="col">Average score</th>
              <th scope="col">Strong fits</th>
            </tr>
          </thead>
          <tbody>
            {jobSummaries(jobs, rows).map(({ job, applicants, averageScore, strongFits }) => (
              <tr key={job.id}>
                <td>
                  <Link to={`/hr/jobs/${job.id}`} className="row-title">{job.title}</Link>
                  <p className="meta">{job.department}</p>
                </td>
                <td><JobStatusTag status={job.status} /></td>
                <td>{applicants}</td>
                <td>{averageScore === null ? <span className="meta">—</span> : formatScore(averageScore)}</td>
                <td>{strongFits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

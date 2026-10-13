import { useState } from "react";

import { listOpenJobs } from "../data/jobs";
import type { EmploymentType, Job } from "../data/types";
import { EMPLOYMENT_LABEL, formatDate } from "../labels";
import { Link } from "../router";
import { useLoad } from "../useLoad";

export function jobMeta(job: Pick<Job, "department" | "location" | "employment_type">): string {
  return [job.department, job.location, EMPLOYMENT_LABEL[job.employment_type]].filter(Boolean).join(" · ");
}

export function filterJobs(jobs: Job[], query: string, type: EmploymentType | "all"): Job[] {
  const needle = query.trim().toLowerCase();
  return jobs.filter((job) => {
    if (type !== "all" && job.employment_type !== type) return false;
    if (!needle) return true;
    return [job.title, job.department, job.location].some((value) => value?.toLowerCase().includes(needle));
  });
}

export function JobBoard() {
  const { state } = useLoad(listOpenJobs, "open-jobs");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<EmploymentType | "all">("all");

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="page-kicker">Open roles</p>
          <h1 className="page-title">Find a job and apply with your resume</h1>
        </div>
      </header>

      <div className="toolbar">
        <label className="field grow">
          <span className="field-label">Search</span>
          <input
            className="input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Title, team or location"
          />
        </label>
        <label className="field">
          <span className="field-label">Type</span>
          <select className="select" value={type} onChange={(event) => setType(event.target.value as EmploymentType | "all")}>
            <option value="all">All types</option>
            {Object.entries(EMPLOYMENT_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state.status === "loading" && <p className="meta">Loading jobs…</p>}
      {state.status === "error" && <p className="notice notice-error">{state.message}</p>}
      {state.status === "ready" && <JobList jobs={filterJobs(state.data, query, type)} total={state.data.length} />}
    </div>
  );
}

function JobList({ jobs, total }: { jobs: Job[]; total: number }) {
  if (total === 0) return <p className="notice">No jobs are open right now. Check back soon.</p>;
  if (jobs.length === 0) return <p className="notice">No jobs match your search.</p>;
  return (
    <>
      <p className="meta" aria-live="polite">
        {jobs.length} of {total} open {total === 1 ? "role" : "roles"}
      </p>
      <ul className="ruled-list">
        {jobs.map((job) => (
          <li key={job.id} className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <Link to={`/jobs/${job.id}`} className="row-title">
                {job.title}
              </Link>
              <p className="meta">{jobMeta(job)}</p>
            </div>
            <span className="meta">Posted {formatDate(job.created_at)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

import { useState } from "react";

import { listOpenJobs } from "../data/jobs";
import type { EmploymentType, Job } from "../data/types";
import { EMPLOYMENT_LABEL, formatDate } from "../labels";
import { Link } from "../router";
import { useLoad } from "../useLoad";

const ALL = "all";

export interface JobFilters {
  query: string;
  type: EmploymentType | typeof ALL;
  department: string;
  location: string;
}

export const NO_JOB_FILTERS: JobFilters = { query: "", type: ALL, department: ALL, location: ALL };

export function jobMeta(job: Pick<Job, "department" | "location" | "employment_type">): string {
  return [job.department, job.location, EMPLOYMENT_LABEL[job.employment_type]].filter(Boolean).join(" · ");
}

export function filterJobs(jobs: Job[], filters: JobFilters): Job[] {
  const needle = filters.query.trim().toLowerCase();
  return jobs.filter((job) => {
    if (filters.type !== ALL && job.employment_type !== filters.type) return false;
    if (filters.department !== ALL && job.department !== filters.department) return false;
    if (filters.location !== ALL && job.location !== filters.location) return false;
    if (!needle) return true;
    return [job.title, job.department, job.location].some((value) => value?.toLowerCase().includes(needle));
  });
}

// The choices a filter offers are the values the open jobs actually have.
export function distinctValues(jobs: Job[], key: "department" | "location"): string[] {
  const values = jobs.map((job) => job[key]).filter((value): value is string => Boolean(value));
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function JobBoard() {
  const { state } = useLoad(listOpenJobs, "open-jobs");
  const [filters, setFilters] = useState<JobFilters>(NO_JOB_FILTERS);
  const jobs = state.status === "ready" ? state.data : [];
  const isFiltered = JSON.stringify(filters) !== JSON.stringify(NO_JOB_FILTERS);

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
          <input className="input" type="search" value={filters.query} placeholder="Title, team or location"
            onChange={(event) => setFilters({ ...filters, query: event.target.value })} />
        </label>
        <ChoiceFilter label="Team" allLabel="All teams" value={filters.department} options={distinctValues(jobs, "department")}
          onChange={(department) => setFilters({ ...filters, department })} />
        <ChoiceFilter label="Location" allLabel="All locations" value={filters.location}
          options={distinctValues(jobs, "location")} onChange={(location) => setFilters({ ...filters, location })} />
        <label className="field">
          <span className="field-label">Type</span>
          <select className="select" value={filters.type}
            onChange={(event) => setFilters({ ...filters, type: event.target.value as JobFilters["type"] })}>
            <option value={ALL}>All types</option>
            {Object.entries(EMPLOYMENT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {isFiltered && (
          <button type="button" className="link-button self-end" onClick={() => setFilters(NO_JOB_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>

      {state.status === "loading" && <p className="meta">Loading jobs…</p>}
      {state.status === "error" && <p className="notice notice-error">{state.message}</p>}
      {state.status === "ready" && <JobList jobs={filterJobs(state.data, filters)} total={state.data.length} />}
    </div>
  );
}

interface ChoiceFilterProps {
  label: string;
  allLabel: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

function ChoiceFilter({ label, allLabel, value, options, onChange }: ChoiceFilterProps) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select className="select" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value={ALL}>{allLabel}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
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

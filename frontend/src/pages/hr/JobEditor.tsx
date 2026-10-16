import { useState, type FormEvent } from "react";

import { Field } from "../../components/Field";
import { RequirementBuilder } from "../../components/RequirementBuilder";
import { JobStatusTag } from "../../components/Tags";
import { createJob, getJob, updateJob } from "../../data/jobs";
import type { EmploymentType, Job, JobFields, JobStatus } from "../../data/types";
import { EMPLOYMENT_LABEL } from "../../labels";
import { Link, navigate } from "../../router";
import type { ApiResult } from "../../types";
import { useLoad } from "../../useLoad";

const MIN_TITLE_CHARS = 3;
const MIN_DESCRIPTION_CHARS = 20;
const EMPTY_FIELDS: JobFields = { title: "", department: "", location: "", employment_type: "full_time", description: "" };

export function fieldsProblem(fields: JobFields): string | null {
  if (fields.title.trim().length < MIN_TITLE_CHARS) return "Give the job a title.";
  if (fields.description.trim().length < MIN_DESCRIPTION_CHARS) {
    return `Describe the role in at least ${MIN_DESCRIPTION_CHARS} characters.`;
  }
  return null;
}

function cleaned(fields: JobFields): JobFields {
  return {
    title: fields.title.trim(),
    department: fields.department?.trim() || null,
    location: fields.location?.trim() || null,
    employment_type: fields.employment_type,
    description: fields.description.trim(),
  };
}

export function JobEditor({ jobId }: { jobId: string | null }) {
  const load = useLoad<Job | null>(
    () => (jobId ? getJob(jobId) : Promise.resolve<ApiResult<Job | null>>({ ok: true, data: null })),
    jobId ?? "new",
  );
  if (load.state.status === "loading") return <div className="page meta">Loading job…</div>;
  if (load.state.status === "error") return <div className="page"><p className="notice notice-error">{load.state.message}</p></div>;
  if (jobId && !load.state.data) return <div className="page"><p className="notice">That job doesn't exist.</p></div>;
  const job = load.state.data;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="page-kicker">
            <Link to={job ? `/hr/jobs/${job.id}` : "/hr/jobs"} className="link-button">
              {job ? "Back to applicants" : "All jobs"}
            </Link>
          </p>
          <h1 className="page-title">{job ? `Edit: ${job.title}` : "New job"}</h1>
        </div>
        {job && <JobStatusTag status={job.status} />}
      </header>
      {/* Keyed by id: a new job's form is replaced by the saved job's form after creation. */}
      <EditorSections key={job?.id ?? "new"} job={job} onChanged={load.reload} />
    </div>
  );
}

function EditorSections({ job, onChanged }: { job: Job | null; onChanged: () => void }) {
  // Shared so "Draft from description" reads what HR is typing, not the last saved text.
  const [description, setDescription] = useState(job?.description ?? "");
  return (
    <div className="stack">
      <JobFieldsForm job={job} onSaved={onChanged} onDescriptionChange={setDescription} />
      {job && <RequirementBuilder job={{ ...job, description }} onSaved={onChanged} />}
      {job && <StatusControls job={job} onChanged={onChanged} />}
    </div>
  );
}

interface JobFieldsFormProps {
  job: Job | null;
  onSaved: () => void;
  onDescriptionChange: (description: string) => void;
}

function JobFieldsForm({ job, onSaved, onDescriptionChange }: JobFieldsFormProps) {
  const [fields, setFields] = useState<JobFields>(job ?? EMPTY_FIELDS);
  const [problem, setProblem] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  function set<K extends keyof JobFields>(key: K, value: JobFields[K]) {
    setFields({ ...fields, [key]: value });
    if (key === "description") onDescriptionChange(value as string);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const invalid = fieldsProblem(fields);
    if (invalid) return setProblem(invalid);
    setIsBusy(true);
    const values = cleaned(fields);
    const result = job ? await updateJob(job.id, values) : await createJob(values);
    setIsBusy(false);
    if (!result.ok) return setProblem(result.message);
    setProblem(null);
    if (!job && typeof result.data === "string") navigate(`/hr/jobs/${result.data}/edit`, { replace: true });
    else onSaved();
  }

  return (
    <form className="sheet form-grid" onSubmit={(event) => void submit(event)} noValidate>
      <h2 className="section-title">Job details</h2>
      <div className="form-grid form-grid-2">
        <label className="field">
          <span className="field-label">Title</span>
          <input className="input" value={fields.title} onChange={(e) => set("title", e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Type</span>
          <select className="select" value={fields.employment_type}
            onChange={(e) => set("employment_type", e.target.value as EmploymentType)}>
            {Object.entries(EMPLOYMENT_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Department</span>
          <input className="input" value={fields.department ?? ""} onChange={(e) => set("department", e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Location</span>
          <input className="input" value={fields.location ?? ""} onChange={(e) => set("location", e.target.value)} />
        </label>
      </div>
      <Field label="Description" hint="Candidates read this, and Gemini drafts the requirements from it.">
        {(control) => (
          <textarea {...control} className="textarea min-h-56" value={fields.description}
            onChange={(e) => set("description", e.target.value)} />
        )}
      </Field>
      {problem && <p className="problem" role="alert">{problem}</p>}
      <div>
        <button type="submit" className="btn-primary" disabled={isBusy}>
          {isBusy ? "Saving…" : job ? "Save details" : "Create draft job"}
        </button>
      </div>
    </form>
  );
}

function StatusControls({ job, onChanged }: { job: Job; onChanged: () => void }) {
  const [problem, setProblem] = useState<string | null>(null);

  async function setStatus(status: JobStatus) {
    const result = await updateJob(job.id, { status });
    if (!result.ok) return setProblem(result.message);
    setProblem(null);
    onChanged();
  }

  return (
    <section className="sheet">
      <h2 className="section-title">Publishing</h2>
      <p className="meta mb-3">
        {job.status === "draft" && "Draft jobs are visible to HR only."}
        {job.status === "open" && "Open: candidates can see and apply to this job."}
        {job.status === "closed" && "Closed: candidates who applied still see it; nobody new can apply."}
      </p>
      {problem && <p className="problem mb-3" role="alert">{problem}</p>}
      <div className="flex flex-wrap gap-3">
        {job.status !== "open" && (
          <button type="button" className="btn-primary" onClick={() => void setStatus("open")}>
            {job.status === "draft" ? "Publish" : "Reopen"}
          </button>
        )}
        {job.status === "open" && (
          <button type="button" className="btn-outline" onClick={() => void setStatus("closed")}>
            Close applications
          </button>
        )}
      </div>
    </section>
  );
}

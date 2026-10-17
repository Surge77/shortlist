import type { ReactNode } from "react";

import { useAuth } from "../auth/AuthProvider";
import { ApplyForm } from "../components/ApplyForm";
import { StageTag } from "../components/Tags";
import { listMyApplications } from "../data/applications";
import { getJob } from "../data/jobs";
import type { Job, JobRequirements, MyApplication } from "../data/types";
import { EDUCATION_LABEL, formatDate } from "../labels";
import { Link } from "../router";
import { useLoad } from "../useLoad";
import { jobMeta } from "./JobBoard";

export function JobDetail({ jobId }: { jobId: string }) {
  const { state } = useLoad(() => getJob(jobId), jobId);

  if (state.status === "loading") return <div className="page meta">Loading job…</div>;
  if (state.status === "error") return <div className="page"><p className="notice notice-error">{state.message}</p></div>;
  if (!state.data) return <div className="page"><p className="notice">This job isn't available.</p></div>;
  const job = state.data;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="page-kicker">
            <Link to="/jobs" className="link-button">
              All jobs
            </Link>
          </p>
          <h1 className="page-title">{job.title}</h1>
          <p className="meta mt-1">{jobMeta(job)}</p>
        </div>
      </header>
      <div className="two-column">
        <article className="stack">
          <section>
            <h2 className="section-title">About the role</h2>
            <p className="prose">{job.description}</p>
          </section>
          {job.requirements && <RequirementsSummary requirements={job.requirements} />}
        </article>
        <aside className="sheet">
          <h2 className="section-title">Apply</h2>
          <ApplySection job={job} />
        </aside>
      </div>
    </div>
  );
}

function RequirementsSummary({ requirements }: { requirements: JobRequirements }) {
  const { must_have, nice_to_have, min_years, education_level, education_fields, certifications } = requirements;
  return (
    <section>
      <h2 className="section-title">What we're looking for</h2>
      <dl className="grid gap-3">
        {must_have.length > 0 && <Item label="Required">{must_have.join(", ")}</Item>}
        {nice_to_have.length > 0 && <Item label="Nice to have">{nice_to_have.join(", ")}</Item>}
        {min_years ? <Item label="Experience">{min_years}+ years</Item> : null}
        {(education_level || education_fields.length > 0) && (
          <Item label="Education">
            {[education_level && EDUCATION_LABEL[education_level], education_fields.join(", ")]
              .filter(Boolean)
              .join(" in ")}
          </Item>
        )}
        {certifications.length > 0 && <Item label="Certifications">{certifications.join(", ")}</Item>}
      </dl>
    </section>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="field-label">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ApplySection({ job }: { job: Job }) {
  const { auth } = useAuth();
  const isCandidate = auth.status === "signedIn" && auth.role === "candidate";
  const mine = useLoad<MyApplication[]>(
    () => (isCandidate ? listMyApplications() : Promise.resolve({ ok: true, data: [] })),
    `${job.id}:${isCandidate}`,
  );

  if (job.status !== "open") return <p>This job is no longer taking applications.</p>;
  if (auth.status === "loading") return <p className="meta">Checking your account…</p>;
  if (auth.status !== "signedIn") {
    return (
      <p>
        <Link to={`/login?next=${encodeURIComponent(`/jobs/${job.id}`)}`} className="btn-primary">
          Sign in to apply
        </Link>
      </p>
    );
  }
  if (auth.role === "hr") return <p>HR accounts can't apply to jobs.</p>;
  if (mine.state.status === "loading") return <p className="meta">Checking your applications…</p>;

  const existing = mine.state.status === "ready" ? mine.state.data.find((a) => a.job?.id === job.id) : undefined;
  if (existing) {
    return (
      <p>
        You applied on {formatDate(existing.created_at)}. Status: <StageTag stage={existing.stage} forCandidate />
      </p>
    );
  }
  return <ApplyForm jobId={job.id} />;
}

import { useState } from "react";

import { draftRequirements, rescoreJob, saveRequirements } from "../api";
import { DEFAULT_WEIGHTS, EMPTY_REQUIREMENTS, type Job, type ScoreCategory, type Weights } from "../data/types";
import {
  fromDraft,
  isEmpty,
  MAX_WEIGHT,
  toDraft,
  WEIGHT_LABELS,
  weightsProblem,
  type RequirementsDraft,
} from "../hr/requirementsForm";
import { EDUCATION_LABEL } from "../labels";
import { Field } from "./Field";

type Phase =
  | { kind: "idle"; message: string | null; problem: string | null }
  | { kind: "busy"; action: "draft" | "save" | "rescore" };

const LIST_FIELDS: { key: keyof RequirementsDraft; label: string; hint: string }[] = [
  { key: "mustHave", label: "Must-have skills", hint: "One per line. Missing one is flagged, never auto-rejected." },
  { key: "niceToHave", label: "Nice-to-have skills", hint: "One per line." },
  { key: "certifications", label: "Certifications", hint: "One per line." },
  { key: "educationFields", label: "Fields of study", hint: "One per line, e.g. Computer Science." },
];

interface RequirementBuilderProps {
  job: Pick<Job, "id" | "description" | "requirements" | "weights" | "requirements_version">;
  onSaved: () => void;
}

export function RequirementBuilder({ job, onSaved }: RequirementBuilderProps) {
  const [draft, setDraft] = useState<RequirementsDraft>(toDraft(job.requirements ?? EMPTY_REQUIREMENTS));
  const [weights, setWeights] = useState<Weights>(job.weights ?? DEFAULT_WEIGHTS);
  const [phase, setPhase] = useState<Phase>({ kind: "idle", message: null, problem: null });
  const isBusy = phase.kind === "busy";

  async function draftFromDescription() {
    setPhase({ kind: "busy", action: "draft" });
    const result = await draftRequirements(job.description);
    if (!result.ok) return setPhase({ kind: "idle", message: null, problem: result.message });
    setDraft(toDraft(result.data));
    setPhase({ kind: "idle", message: "Draft ready. Check every item before approving.", problem: null });
  }

  async function approve() {
    const parsed = fromDraft(draft);
    const problem = !parsed.ok
      ? parsed.message
      : isEmpty(parsed.requirements)
        ? "Add at least one requirement."
        : weightsProblem(weights, parsed.requirements);
    if (problem || !parsed.ok) return setPhase({ kind: "idle", message: null, problem });
    setPhase({ kind: "busy", action: "save" });
    const result = await saveRequirements(job.id, parsed.requirements, weights);
    if (!result.ok) return setPhase({ kind: "idle", message: null, problem: result.message });
    setPhase({ kind: "idle", message: `Approved as version ${result.data.requirements_version}.`, problem: null });
    onSaved();
  }

  async function rescore() {
    setPhase({ kind: "busy", action: "rescore" });
    const result = await rescoreJob(job.id);
    setPhase(
      result.ok
        ? { kind: "idle", message: `Rescoring ${result.data.queued} applications in the background.`, problem: null }
        : { kind: "idle", message: null, problem: result.message },
    );
  }

  return (
    <section className="sheet stack" aria-labelledby="requirements-title">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="requirements-title" className="section-title">
          Requirements {job.requirements ? `(version ${job.requirements_version})` : "(not approved yet)"}
        </h2>
        <button type="button" className="btn-outline" disabled={isBusy} onClick={() => void draftFromDescription()}>
          {phase.kind === "busy" && phase.action === "draft" ? "Drafting…" : "Draft from description"}
        </button>
      </div>
      <p className="meta">
        Scoring runs only against approved requirements. Gemini drafts them from the description; you decide what
        stays.
      </p>

      <div className="form-grid form-grid-2">
        {LIST_FIELDS.map(({ key, label, hint }) => (
          <Field key={key} label={label} hint={hint}>
            {(control) => (
              <textarea
                {...control}
                className="textarea"
                value={draft[key]}
                disabled={isBusy}
                onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
              />
            )}
          </Field>
        ))}
        <label className="field">
          <span className="field-label">Minimum years of experience</span>
          <input
            className="input"
            inputMode="decimal"
            value={draft.minYears}
            disabled={isBusy}
            onChange={(event) => setDraft({ ...draft, minYears: event.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">Minimum education</span>
          <select
            className="select"
            value={draft.educationLevel}
            disabled={isBusy}
            onChange={(event) => setDraft({ ...draft, educationLevel: event.target.value as RequirementsDraft["educationLevel"] })}
          >
            <option value="">Not required</option>
            {Object.entries(EDUCATION_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset>
        <legend className="field-label mb-2">Weights (relative importance; categories the job doesn't ask about drop out)</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(Object.keys(WEIGHT_LABELS) as ScoreCategory[]).map((key) => (
            <label key={key} className="field">
              <span className="field-hint">
                {WEIGHT_LABELS[key]}
                <span className="sr-only"> weight</span>
              </span>
              <input
                className="input"
                type="number"
                min={0}
                max={MAX_WEIGHT}
                value={weights[key]}
                disabled={isBusy}
                onChange={(event) => setWeights({ ...weights, [key]: Number(event.target.value) })}
              />
            </label>
          ))}
        </div>
      </fieldset>

      {phase.kind === "idle" && phase.problem && <p className="problem" role="alert">{phase.problem}</p>}
      {phase.kind === "idle" && phase.message && <p role="status">{phase.message}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary" disabled={isBusy} onClick={() => void approve()}>
          {phase.kind === "busy" && phase.action === "save" ? "Saving…" : "Approve requirements"}
        </button>
        {job.requirements && (
          <button type="button" className="btn-outline" disabled={isBusy} onClick={() => void rescore()}>
            Rescore all applications
          </button>
        )}
      </div>
    </section>
  );
}

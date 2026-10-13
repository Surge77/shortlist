import { useState, type FormEvent } from "react";

import { applyToJob } from "../api";
import { ACCEPT, checkFile } from "../files";
import { Link } from "../router";
import { Field } from "./Field";

export const MAX_COVER_NOTE_CHARS = 2000;

type Phase = { kind: "editing"; problem: string | null } | { kind: "sending" } | { kind: "sent" };

export function ApplyForm({ jobId }: { jobId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "editing", problem: null });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = !file
      ? "Choose your resume file."
      : (checkFile(file) ?? (note.length > MAX_COVER_NOTE_CHARS ? "The cover note is too long." : null));
    if (problem || !file) {
      setPhase({ kind: "editing", problem });
      return;
    }
    setPhase({ kind: "sending" });
    const result = await applyToJob(jobId, file, note);
    if (!result.ok) {
      setPhase({ kind: "editing", problem: result.message });
      return;
    }
    setPhase({ kind: "sent" });
  }

  if (phase.kind === "sent") {
    return (
      <div className="notice" role="status">
        <p className="font-semibold text-ink">Application sent.</p>
        <p className="mt-1">
          HR will review it. Follow its status in{" "}
          <Link to="/me/applications" className="link-button">
            My applications
          </Link>
          .
        </p>
      </div>
    );
  }

  const isSending = phase.kind === "sending";
  return (
    <form className="form-grid" onSubmit={(event) => void submit(event)} noValidate>
      <Field label="Resume" hint="PDF, Word (.docx), PNG, JPG or WebP, up to 5 MB.">
        {(control) => (
          <input
            {...control}
            className="input"
            type="file"
            accept={ACCEPT}
            disabled={isSending}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        )}
      </Field>
      <Field
        label="Cover note (optional)"
        hint={`${note.length.toLocaleString()} / ${MAX_COVER_NOTE_CHARS.toLocaleString()} characters`}
      >
        {(control) => (
          <textarea
            {...control}
            className="textarea"
            value={note}
            maxLength={MAX_COVER_NOTE_CHARS}
            disabled={isSending}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </Field>
      {phase.kind === "editing" && phase.problem && (
        <p className="problem" role="alert">
          {phase.problem}
        </p>
      )}
      <div>
        <button type="submit" className="btn-primary" disabled={isSending}>
          {isSending ? "Sending…" : "Send application"}
        </button>
      </div>
    </form>
  );
}

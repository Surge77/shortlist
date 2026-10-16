import { useState, type FormEvent } from "react";

import { applyToJob, quickApply } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { getMyProfile } from "../data/profile";
import { ACCEPT, checkFile } from "../files";
import { Link } from "../router";
import { useLoad } from "../useLoad";
import { Field } from "./Field";

export const MAX_COVER_NOTE_CHARS = 2000;

type Phase = { kind: "editing"; problem: string | null } | { kind: "sending" } | { kind: "sent" };
type Source = "saved" | "upload";

export function ApplyForm({ jobId }: { jobId: string }) {
  const { auth } = useAuth();
  const userId = auth.status === "signedIn" ? auth.userId : "";
  const profile = useLoad(() => getMyProfile(userId), userId);
  const savedName = profile.state.status === "ready" ? (profile.state.data?.resume_filename ?? null) : null;
  const hasSaved = profile.state.status === "ready" && Boolean(profile.state.data?.resume_path);
  const [chosen, setChosen] = useState<Source | null>(null);
  // The saved resume is the default once we know there is one; the candidate can switch.
  const source: Source = chosen ?? (hasSaved ? "saved" : "upload");
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "editing", problem: null });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const noteProblem = note.length > MAX_COVER_NOTE_CHARS ? "The cover note is too long." : null;
    const fileProblem = source === "saved" ? null : !file ? "Choose your resume file." : checkFile(file);
    const problem = fileProblem ?? noteProblem;
    if (problem) {
      setPhase({ kind: "editing", problem });
      return;
    }
    setPhase({ kind: "sending" });
    const result = source === "saved" || !file ? await quickApply(jobId, note) : await applyToJob(jobId, file, note);
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
      {hasSaved && (
        <fieldset className="field">
          <legend className="field-label">Resume</legend>
          <label className="check">
            <input type="radio" name="resume-source" checked={source === "saved"} disabled={isSending}
              onChange={() => setChosen("saved")} />
            Use my saved resume{savedName ? ` (${savedName})` : ""}
          </label>
          <label className="check">
            <input type="radio" name="resume-source" checked={source === "upload"} disabled={isSending}
              onChange={() => setChosen("upload")} />
            Upload a different file
          </label>
        </fieldset>
      )}
      {source === "upload" && <Field
        label={hasSaved ? "Resume file" : "Resume"}
        hint="PDF, Word (.docx), PNG, JPG or WebP, up to 5 MB. Google Gemini reads it to help HR review your application."
      >
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
      </Field>}
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

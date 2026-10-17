import { useState, type FormEvent } from "react";

import { removeSavedResume, saveResume } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { Field } from "../components/Field";
import { resumeUrl } from "../data/applications";
import { getMyProfile, MAX_NAME_CHARS, renameMe, type MyProfile } from "../data/profile";
import { ACCEPT, checkFile } from "../files";
import { formatDate } from "../labels";
import { useLoad } from "../useLoad";

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "done"; message: string } | { kind: "problem"; message: string };

export function Profile() {
  const { auth } = useAuth();
  const userId = auth.status === "signedIn" ? auth.userId : "";
  const { state, reload } = useLoad(() => getMyProfile(userId), userId);

  return (
    <div className="page max-w-2xl">
      <header className="page-head">
        <div>
          <p className="page-kicker">Your account</p>
          <h1 className="page-title">Profile</h1>
        </div>
      </header>
      {state.status === "loading" && <p className="meta">Loading your profile…</p>}
      {state.status === "error" && <p className="notice notice-error">{state.message}</p>}
      {state.status === "ready" && state.data && (
        <div className="stack">
          <NameForm userId={userId} profile={state.data} />
          <SavedResume profile={state.data} onChanged={reload} />
        </div>
      )}
    </div>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (status.kind === "done") return <p className="meta" role="status">{status.message}</p>;
  if (status.kind === "problem") return <p className="problem" role="alert">{status.message}</p>;
  return null;
}

function NameForm({ userId, profile }: { userId: string; profile: MyProfile }) {
  const [name, setName] = useState(profile.full_name ?? "");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return setStatus({ kind: "problem", message: "Enter your name." });
    setStatus({ kind: "busy" });
    const result = await renameMe(userId, clean);
    setStatus(result.ok ? { kind: "done", message: "Name saved." } : { kind: "problem", message: result.message });
  }

  return (
    <form className="sheet form-grid" onSubmit={(event) => void submit(event)} noValidate>
      <h2 className="section-title">Your name</h2>
      <Field label="Full name" hint="HR sees this name unless they review blind.">
        {(control) => (
          <input {...control} className="input" autoComplete="name" value={name} maxLength={MAX_NAME_CHARS}
            onChange={(e) => setName(e.target.value)} />
        )}
      </Field>
      <StatusLine status={status} />
      <div>
        <button type="submit" className="btn-primary" disabled={status.kind === "busy"}>Save name</button>
      </div>
    </form>
  );
}

function SavedResume({ profile, onChanged }: { profile: MyProfile; onChanged: () => void }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const isBusy = status.kind === "busy";

  async function upload(file: File | undefined) {
    if (!file) return;
    const problem = checkFile(file);
    if (problem) return setStatus({ kind: "problem", message: problem });
    setStatus({ kind: "busy" });
    const result = await saveResume(file);
    if (!result.ok) return setStatus({ kind: "problem", message: result.message });
    setStatus({ kind: "done", message: `Saved ${result.data.filename}.` });
    onChanged();
  }

  async function remove() {
    setStatus({ kind: "busy" });
    const result = await removeSavedResume();
    if (!result.ok) return setStatus({ kind: "problem", message: result.message });
    setStatus({ kind: "done", message: "Saved resume removed." });
    onChanged();
  }

  async function view(path: string) {
    const result = await resumeUrl(path);
    if (result.ok) window.open(result.data, "_blank", "noopener");
    else setStatus({ kind: "problem", message: result.message });
  }

  return (
    <section className="sheet form-grid" aria-labelledby="saved-resume-heading">
      <h2 id="saved-resume-heading" className="section-title">Saved resume</h2>
      {profile.resume_path ? (
        <p>
          <strong className="text-ink">{profile.resume_filename ?? "Your resume"}</strong>
          {profile.resume_updated_at && <span className="meta"> · saved {formatDate(profile.resume_updated_at)}</span>}
        </p>
      ) : (
        <p className="meta">No saved resume yet. Save one to apply to jobs in one click.</p>
      )}
      <Field label={profile.resume_path ? "Replace with a new file" : "Choose a file"}
        hint="PDF, Word (.docx), PNG, JPG or WebP, up to 5 MB.">
        {(control) => (
          <input {...control} className="input" type="file" accept={ACCEPT} disabled={isBusy}
            onChange={(e) => void upload(e.target.files?.[0])} />
        )}
      </Field>
      <StatusLine status={status} />
      {profile.resume_path && (
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-outline" onClick={() => void view(profile.resume_path ?? "")}>
            View
          </button>
          <button type="button" className="btn-outline" disabled={isBusy} onClick={() => void remove()}>
            Remove
          </button>
        </div>
      )}
    </section>
  );
}

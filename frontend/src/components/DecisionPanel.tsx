import { useState, type FormEvent } from "react";

import { addNote, listNotes, listStageEvents, setStage } from "../data/applications";
import type { Stage } from "../data/types";
import { displayName } from "../format";
import { formatDate, HR_STAGES, STAGE_LABEL } from "../labels";
import { useLoad } from "../useLoad";

const MAX_NOTE_CHARS = 4000;

interface DecisionPanelProps {
  applicationId: string;
  stage: Stage;
  onStageChanged: () => void;
}

// Stage changes and notes are HR's own record; every stage change is audited in the
// database, and the history below reads that audit trail.
export function DecisionPanel({ applicationId, stage, onStageChanged }: DecisionPanelProps) {
  const notes = useLoad(() => listNotes(applicationId), applicationId);
  const events = useLoad(() => listStageEvents(applicationId), `${applicationId}:${stage}`);
  const [problem, setProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function move(next: Stage) {
    const result = await setStage(applicationId, next);
    if (!result.ok) return setProblem(result.message);
    setProblem(null);
    onStageChanged();
  }

  async function saveNote(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    setIsSaving(true);
    const result = await addNote(applicationId, draft.trim());
    setIsSaving(false);
    if (!result.ok) return setProblem(result.message);
    setDraft("");
    notes.reload();
  }

  return (
    <section className="sheet stack" aria-labelledby="decision-title">
      <h2 id="decision-title" className="section-title mb-0">Decision</h2>
      {stage === "withdrawn" ? (
        <p>The candidate withdrew this application.</p>
      ) : (
        <label className="field">
          <span className="field-label">Stage</span>
          <select className="select" value={stage} onChange={(e) => void move(e.target.value as Stage)}>
            {HR_STAGES.map((value) => <option key={value} value={value}>{STAGE_LABEL[value]}</option>)}
          </select>
        </label>
      )}
      {problem && <p className="problem" role="alert">{problem}</p>}

      <div>
        <h3 className="field-label mb-1">Notes (HR only)</h3>
        {notes.state.status === "ready" && notes.state.data.length === 0 && <p className="meta">No notes yet.</p>}
        {notes.state.status === "ready" && (
          <ul className="timeline">
            {notes.state.data.map((note) => (
              <li key={note.id}>
                <p className="prose">{note.body}</p>
                <p className="meta">{displayName(note.author_name)} · {formatDate(note.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
        <form className="form-grid mt-3" onSubmit={(event) => void saveNote(event)}>
          <label className="field">
            <span className="sr-only">New note</span>
            <textarea className="textarea" value={draft} maxLength={MAX_NOTE_CHARS} placeholder="Add a note"
              onChange={(e) => setDraft(e.target.value)} />
          </label>
          <div>
            <button type="submit" className="btn-outline" disabled={isSaving || !draft.trim()}>
              {isSaving ? "Saving…" : "Add note"}
            </button>
          </div>
        </form>
      </div>

      <div>
        <h3 className="field-label mb-1">History</h3>
        {events.state.status === "ready" && events.state.data.length === 0 && <p className="meta">No stage changes yet.</p>}
        {events.state.status === "ready" && (
          <ol className="timeline">
            {events.state.data.map((event) => (
              <li key={event.id}>
                {STAGE_LABEL[event.from_stage]} → {STAGE_LABEL[event.to_stage]}{" "}
                <span className="meta">· {formatDate(event.created_at)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

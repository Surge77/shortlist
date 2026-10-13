import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from "react";

import { ACCEPT, checkFile, MAX_TEXT_CHARS } from "../files";
import { formatFileSize } from "../format";
import { SAMPLE_RESUME } from "../sample";
import type { ResumeInput } from "../types";
import { FileIcon, UploadIcon } from "./icons";

interface InputPanelProps {
  isBusy: boolean;
  onSubmit: (input: ResumeInput) => void;
}

type Mode = "upload" | "paste";

const MODES: ReadonlyArray<{ id: Mode; label: string }> = [
  { id: "upload", label: "Upload a file" },
  { id: "paste", label: "Paste text" },
];

export function InputPanel({ isBusy, onSubmit }: InputPanelProps) {
  const [mode, setMode] = useState<Mode>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const tabRefs = useRef<Partial<Record<Mode, HTMLButtonElement | null>>>({});
  const baseId = useId();

  function chooseFile(candidate: File) {
    const issue = checkFile(candidate);
    setProblem(issue);
    setFile(issue ? null : candidate);
  }

  // A file dropped beside the zone would make the browser open it and leave the app.
  useEffect(() => {
    const keepPage = (event: globalThis.DragEvent) => event.preventDefault();
    window.addEventListener("dragover", keepPage);
    window.addEventListener("drop", keepPage);
    return () => {
      window.removeEventListener("dragover", keepPage);
      window.removeEventListener("drop", keepPage);
    };
  }, []);

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    // Swapping the file mid-extraction would leave the preview showing the old one.
    if (isBusy) return;
    const dropped = event.dataTransfer.files[0];
    if (dropped) chooseFile(dropped);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "upload") {
      if (!file) return setProblem("Choose a resume file first.");
      setProblem(null);
      return onSubmit({ kind: "file", file });
    }
    if (!text.trim()) return setProblem("Paste the resume text first.");
    if (text.length > MAX_TEXT_CHARS) return setProblem(`Pasted text is limited to ${MAX_TEXT_CHARS.toLocaleString()} characters.`);
    setProblem(null);
    onSubmit({ kind: "text", text });
  }

  function fillSample() {
    setMode("paste");
    setText(SAMPLE_RESUME);
    setProblem(null);
  }

  // WAI-ARIA tabs: only the selected tab is in the Tab order; arrow keys switch.
  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next: Mode = mode === "upload" ? "paste" : "upload";
    setMode(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="manuscript">
      <h2 className="panel-title">
        Resume
      </h2>
      <div role="tablist" aria-label="Resume source" className="tab-row">
        {MODES.map(({ id, label }) => (
          <button
            key={id}
            ref={(element) => {
              tabRefs.current[id] = element;
            }}
            id={`${baseId}-${id}-tab`}
            type="button"
            role="tab"
            aria-selected={mode === id}
            aria-controls={`${baseId}-panel`}
            tabIndex={mode === id ? 0 : -1}
            className="tab"
            onClick={() => setMode(id)}
            onKeyDown={handleTabKey}
          >
            {label}
          </button>
        ))}
      </div>

      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${mode}-tab`} className="pt-4">
        {mode === "upload" ? (
          <>
            <label
              className={isDragging ? "dropzone is-dragging" : "dropzone"}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept={ACCEPT}
                aria-label="Resume file"
                className="sr-only"
                disabled={isBusy}
                onChange={(event) => {
                  const chosen = event.target.files?.[0];
                  if (chosen) chooseFile(chosen);
                  event.target.value = "";
                }}
              />
              <UploadIcon />
              <span className="dropzone-title">Drop a resume here, or choose a file</span>
              <span className="text-sm text-muted">PDF, Word (.docx), PNG, JPG or WebP, up to 5 MB</span>
            </label>
            {file && (
              <div className="file-row">
                <FileIcon />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="tabular-nums text-muted">{formatFileSize(file.size)}</span>
                <button type="button" className="link-button" onClick={() => setFile(null)}>
                  Remove
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <textarea
              aria-label="Resume text"
              className="paste-box"
              placeholder="Paste the full text of the resume here."
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <p className="mt-1 text-right text-sm tabular-nums text-muted">
              {text.length.toLocaleString()} / {MAX_TEXT_CHARS.toLocaleString()}
            </p>
          </>
        )}
      </div>

      {problem && (
        <p role="alert" className="problem">
          {problem}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <button type="submit" className="btn-primary" disabled={isBusy}>
          {isBusy ? "Reading…" : "Extract details"}
        </button>
        <button type="button" className="link-button" disabled={isBusy} onClick={fillSample}>
          Try a sample resume
        </button>
      </div>
    </form>
  );
}

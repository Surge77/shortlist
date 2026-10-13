import { useState } from "react";

import { InputPanel } from "./components/InputPanel";
import { ResultView } from "./components/ResultView";
import { SiteHeader } from "./components/SiteHeader";
import { SourcePreview } from "./components/SourcePreview";
import { describeStatus } from "./extractorState";
import { useExtractor } from "./useExtractor";

export function App() {
  const { state, start, retry, reset } = useExtractor();
  // Bumped on "New resume" so the input panel remounts empty.
  const [formKey, setFormKey] = useState(0);
  const input = state.kind === "idle" ? null : state.input;
  const sourceText = state.kind === "done" ? state.result.source_text : null;

  function startOver() {
    reset();
    setFormKey((key) => key + 1);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader showNewResume={state.kind !== "idle"} onNewResume={startOver} />

      <main className="desk flex-1">
        <h1 className="sr-only">Shortlist: resume details for HR</h1>
        <div className="manuscript-column">
          <InputPanel key={formKey} isBusy={state.kind === "extracting"} onSubmit={start} />
          {/* Pasted text is already on screen in the box above; only files need a preview. */}
          {input?.kind === "file" && <SourcePreview file={input.file} sourceText={sourceText} />}
        </div>
        <div className="record-panel">
          <p role="status" className="sr-only">
            {describeStatus(state)}
          </p>
          <ResultView state={state} onRetry={retry} />
        </div>
      </main>

      <footer className="site-footer">
        <p>
          Details are extracted by Gemini and can contain mistakes; check them against the original. On Gemini's
          free tier, Google may use uploaded resumes to improve its products, so use sample or consented files.
        </p>
      </footer>
    </div>
  );
}

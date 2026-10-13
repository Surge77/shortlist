import { useState } from "react";

import { InputPanel } from "../../components/InputPanel";
import { ResultView } from "../../components/ResultView";
import { SourcePreview } from "../../components/SourcePreview";
import { describeStatus } from "../../extractorState";
import { useExtractor } from "../../useExtractor";

// HR's scratch tool: read one resume without filing an application or scoring it.
export function QuickExtract() {
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
    <main className="desk">
      <div className="manuscript-column">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="page-title">Quick extract</h1>
          {state.kind !== "idle" && (
            <button type="button" className="btn-outline" onClick={startOver}>
              New resume
            </button>
          )}
        </div>
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
  );
}

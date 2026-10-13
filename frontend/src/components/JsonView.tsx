import { tokenizeJson } from "../jsonTokens";
import type { Candidate } from "../types";
import { CopyButton } from "./CopyButton";
import { DownloadIcon } from "./icons";

function fileNameFor(candidate: Candidate): string {
  const slug = (candidate.full_name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "candidate"}.json`;
}

// The same object json.ipynb printed, now validated, highlighted and downloadable.
export function JsonView({ candidate }: { candidate: Candidate }) {
  const json = JSON.stringify(candidate, null, 2);

  function download() {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileNameFor(candidate);
    link.click();
    // Revoking in the same tick can cancel the download in Firefox and older Safari.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <CopyButton value={json} label="JSON" showText />
        <button type="button" className="btn-outline" onClick={download}>
          <DownloadIcon />
          Download JSON
        </button>
      </div>
      <pre className="json-view" tabIndex={0} aria-label="Candidate details as JSON">
        <code>
          {tokenizeJson(candidate).map((token, index) =>
            token.kind === "plain" ? (
              token.text
            ) : (
              <span key={index} className={`json-${token.kind}`}>
                {token.text}
              </span>
            ),
          )}
        </code>
      </pre>
    </div>
  );
}

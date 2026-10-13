import { useEffect, useState } from "react";

import { previewKind } from "../files";

interface SourcePreviewProps {
  file: File;
  // What the server read from a Word file; PDFs and images preview as themselves.
  sourceText: string | null;
}

// The browser already holds the file; a blob: URL previews it without uploading it again.
function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== "function") {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url;
}

export function SourcePreview({ file, sourceText }: SourcePreviewProps) {
  const url = useObjectUrl(file);
  const kind = previewKind(file);

  return (
    <section className="manuscript" aria-labelledby="original-heading">
      <h2 id="original-heading" className="panel-title">
        Original
      </h2>
      {kind === "pdf" && url && (
        <iframe src={url} title="Original resume (PDF)" className="preview-frame" />
      )}
      {kind === "image" && url && (
        <img src={url} alt="Original resume" className="preview-image" />
      )}
      {kind === "docx" &&
        (sourceText ? (
          <pre className="preview-text">{sourceText}</pre>
        ) : (
          <p className="text-muted">Word files are previewed as their text once the details are extracted.</p>
        ))}
    </section>
  );
}

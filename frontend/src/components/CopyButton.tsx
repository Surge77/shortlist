import { useEffect, useRef, useState } from "react";

import { CheckIcon, CopyIcon } from "./icons";

interface CopyButtonProps {
  value: string;
  label: string;
  // Icon-only for inline contact rows; with text for toolbars.
  showText?: boolean;
}

const FEEDBACK_MS = 2_000;

export function CopyButton({ value, label, showText = false }: CopyButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus("idle"), FEEDBACK_MS);
  }

  const text = status === "copied" ? "Copied" : status === "failed" ? "Couldn't copy" : `Copy ${label}`;
  return (
    <button
      type="button"
      className={showText ? "btn-outline" : "copy-button"}
      aria-label={text}
      title={text}
      onClick={copy}
    >
      {status === "copied" ? <CheckIcon /> : <CopyIcon />}
      {showText && <span>{status === "idle" ? "Copy" : text}</span>}
    </button>
  );
}

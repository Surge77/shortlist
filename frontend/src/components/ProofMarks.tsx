// Proof marks after BS 5261. Red marks what the recruiter must query; blue marks what the
// code worked out. They are drawn, never typed glyphs.

interface QueryProps {
  text: string;
  // Read by screen readers after the mark, e.g. "this email", so the query names its subject.
  subject?: string;
}

export function Query({ text, subject }: QueryProps) {
  return (
    <strong className="query-word">
      {text}
      {subject && <span className="sr-only"> {subject}</span>}
    </strong>
  );
}

// A caret where the missing detail belongs, with a line out to the margin query.
export function MissingSlot() {
  return (
    <span className="slot" aria-hidden="true">
      <svg className="caret" width="14" height="12" viewBox="0 0 14 12">
        <path d="M1.5 11 7 1.5l5.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
      <span className="slot-line" />
    </span>
  );
}

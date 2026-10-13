import { useId, type ReactNode } from "react";

export interface ControlProps {
  id: string;
  "aria-describedby"?: string;
}

interface FieldProps {
  label: string;
  hint?: ReactNode;
  children: (control: ControlProps) => ReactNode;
}

// The hint sits outside the label and is linked by aria-describedby, so a screen reader
// announces "Resume" as the field's name and reads the hint as its description.
export function Field({ label, hint, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children({ id, "aria-describedby": hint ? hintId : undefined })}
      {hint && (
        <span id={hintId} className="field-hint">
          {hint}
        </span>
      )}
    </div>
  );
}

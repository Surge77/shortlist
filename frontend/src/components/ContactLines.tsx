import type { Candidate, CheckedField } from "../types";
import { CopyButton } from "./CopyButton";
import { MissingSlot, Query } from "./ProofMarks";

interface FieldSpec {
  key: keyof Candidate["contact"];
  label: string;
  // A missing required detail is marked and queried; an optional one reads "None listed".
  isRequired: boolean;
}

const FIELDS: FieldSpec[] = [
  { key: "email", label: "Email", isRequired: true },
  { key: "phone", label: "Phone", isRequired: true },
  { key: "linkedin", label: "LinkedIn", isRequired: true },
  { key: "location", label: "Location", isRequired: false },
  { key: "github", label: "GitHub", isRequired: false },
  { key: "portfolio", label: "Portfolio", isRequired: false },
];

// Only characters that cannot start mailto: parameters (? & # %): a "resume email" like
// a@b.com?bcc=attacker@x.com must never become a link that copies someone in.
const SAFE_EMAIL = /^[^\s@?&#%]+@[^\s@?&#%]+$/;

// Links are built here, never taken from the model as-is: a value only ever becomes a
// mailto:, tel: or https: URL, so extracted text cannot smuggle in a javascript: link.
function hrefFor(key: FieldSpec["key"], value: string, isInvalid: boolean): string | null {
  if (key === "email") return !isInvalid && SAFE_EMAIL.test(value) ? `mailto:${value}` : null;
  if (key === "phone") return isInvalid ? null : `tel:${value.replace(/[^\d+]/g, "")}`;
  if (key === "location") return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/+/, "")}`;
}

function Value({ field, value, isInvalid }: { field: FieldSpec; value: string; isInvalid: boolean }) {
  const href = hrefFor(field.key, value, isInvalid);
  const className = isInvalid ? "field-value is-queried" : "field-value";
  if (!href) return <span className={className}>{value}</span>;
  const isExternal = /^https?:/i.test(href);
  return (
    <a href={href} className={className} {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {value}
    </a>
  );
}

interface ContactLinesProps {
  contact: Candidate["contact"];
  invalidFields: CheckedField[];
}

export function ContactLines({ contact, invalidFields }: ContactLinesProps) {
  return (
    <dl className="gblock">
      {FIELDS.map((field) => {
        const value = contact[field.key];
        const isInvalid = invalidFields.includes(field.key as CheckedField);
        const isMissing = !value && field.isRequired;
        return (
          <div key={field.key} className="gline">
            <dt className="gl-label">{field.label}</dt>
            <dd className="gl-cell">
              <div className="gl-value">
                {value && <Value field={field} value={value} isInvalid={isInvalid} />}
                {value && <CopyButton value={value} label={field.label.toLowerCase()} />}
                {isMissing && <MissingSlot />}
                {!value && !field.isRequired && <span className="none-listed">None listed</span>}
              </div>
              {isMissing && (
                <p className="gnote gnote-query">
                  <Query text="Not given" subject={`(${field.label})`} /> Ask the candidate for it.
                </p>
              )}
              {value && isInvalid && (
                <p className="gnote gnote-query">
                  <Query text="Check" subject={`this ${field.label.toLowerCase()}`} /> It doesn't look well formed.
                </p>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

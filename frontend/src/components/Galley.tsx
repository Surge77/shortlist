import { useEffect, useRef } from "react";

import { displayName } from "../format";
import type { ExtractResponse } from "../types";
import { CareerLines } from "./CareerLines";
import { ContactLines } from "./ContactLines";
import { RecordLines, SkillLines } from "./DetailLines";

// The rule-based checks, written in the margin beside the name so they are read first.
function Checks({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) {
    return (
      <section className="gnote gnote-blue" aria-labelledby="checks-heading">
        <h4 id="checks-heading">Checks</h4>
        <p>Every required detail is present and well formed.</p>
      </section>
    );
  }
  return (
    <section className="gnote gnote-query" aria-labelledby="checks-heading">
      <h4 id="checks-heading">Worth checking</h4>
      <ul>
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </section>
  );
}

export function Galley({ result }: { result: ExtractResponse }) {
  const { candidate } = result;
  const heading = useRef<HTMLHeadingElement>(null);
  // The record replaces the empty galley; moving focus here takes keyboard and
  // screen-reader users straight to it.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <article className="galley" aria-labelledby="candidate-name">
      <div className="gblock">
        <div className="gbody">
          <div className="gline">
            <div className="gl-wide">
              <h3 id="candidate-name" ref={heading} tabIndex={-1} className="candidate-name">
                {displayName(candidate.full_name)}
              </h3>
              {candidate.headline && <p className="lead">{candidate.headline}</p>}
            </div>
          </div>
        </div>
        <Checks warnings={result.warnings} />
      </div>

      <ContactLines contact={candidate.contact} invalidFields={result.invalid_fields} />

      {candidate.summary && (
        <div className="gblock">
          <div className="gbody">
            <div className="gline">
              <p className="gl-wide max-w-[68ch]">{candidate.summary}</p>
            </div>
          </div>
          <p className="gnote">Summary written by Gemini from the resume, not quoted from it.</p>
        </div>
      )}

      <CareerLines experience={candidate.experience} months={result.experience_months} />
      <SkillLines candidate={candidate} />
      <RecordLines candidate={candidate} />
    </article>
  );
}

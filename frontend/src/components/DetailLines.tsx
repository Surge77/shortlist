import type { ReactNode } from "react";

import { formatSpan } from "../format";
import type { Candidate } from "../types";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="gblock" aria-labelledby={id}>
      <div className="gbody">
        <h4 id={id} className="gsec">
          {title}
        </h4>
        <div className="glist">{children}</div>
      </div>
    </section>
  );
}

function Line({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="gline">
      {label !== undefined && <p className="gl-label">{label}</p>}
      <div className={label === undefined ? "gl-wide" : "gl-value"}>{children}</div>
    </div>
  );
}

// Skills are set as running text, the way the resume lists them, not as tags.
export function SkillLines({ candidate }: { candidate: Candidate }) {
  const groups = [
    { label: "Technical", items: candidate.skills.technical },
    { label: "Tools", items: candidate.skills.tools },
    { label: "Soft skills", items: candidate.skills.soft },
    { label: "Languages", items: candidate.languages },
  ].filter((group) => group.items.length > 0);
  if (groups.length === 0) return null;

  return (
    <Section id="skills-heading" title="Skills">
      {groups.map((group) => (
        <Line key={group.label} label={group.label}>
          <p className="field-value">{group.items.join(", ")}</p>
        </Line>
      ))}
    </Section>
  );
}

export function RecordLines({ candidate }: { candidate: Candidate }) {
  const { education, projects, certifications, achievements } = candidate;

  return (
    <>
      {education.length > 0 && (
        <Section id="education-heading" title="Education">
          {education.map((school, index) => (
            <Line key={`${school.institution}-${index}`} label={formatSpan(school.start, school.end)}>
              <p className="job-role">{[school.degree, school.field].filter(Boolean).join(", ") || "Course not given"}</p>
              {school.institution && <p className="text-muted">{school.institution}</p>}
              {school.grade && <p className="text-muted">{school.grade}</p>}
            </Line>
          ))}
        </Section>
      )}
      {certifications.length > 0 && (
        <Section id="certifications-heading" title="Certifications">
          {certifications.map((certification, index) => (
            <Line key={`${certification.name}-${index}`} label={certification.year ?? "Year not given"}>
              <p>
                <strong className="text-ink">{certification.name}</strong>
                {certification.issuer && <span className="text-muted">, {certification.issuer}</span>}
              </p>
            </Line>
          ))}
        </Section>
      )}
      {projects.length > 0 && (
        <Section id="projects-heading" title="Projects">
          {projects.map((project, index) => (
            <Line key={`${project.name}-${index}`}>
              <p className="job-role">{project.name}</p>
              {project.description && <p>{project.description}</p>}
              {project.tech.length > 0 && <p className="text-muted">Built with {project.tech.join(", ")}</p>}
            </Line>
          ))}
        </Section>
      )}
      {achievements.length > 0 && (
        <Section id="achievements-heading" title="Achievements">
          {achievements.map((achievement, index) => (
            <Line key={`${achievement}-${index}`}>
              <p>{achievement}</p>
            </Line>
          ))}
        </Section>
      )}
    </>
  );
}

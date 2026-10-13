import type { CSSProperties } from "react";

import { careerStrip, type CareerStrip } from "../career";
import { formatDuration, formatMonth } from "../format";
import { monthIndex } from "../months";
import type { Experience } from "../types";

interface CareerLinesProps {
  experience: Experience[];
  months: number | null;
  today?: Date;
}

// Beyond this many years the axis labels every other year so they never collide.
const DENSE_AXIS_YEARS = 12;
const DENSE_AXIS_STEP = 2;

function roleDuration(job: Experience, today: Date): string | null {
  const start = monthIndex(job.start, false, today);
  const end = monthIndex(job.end, true, today);
  if (start === null || end === null || end < start) return null;
  return formatDuration(end - start + 1);
}

function YearAxis({ firstYear, lastYear }: { firstYear: number; lastYear: number }) {
  const count = lastYear - firstYear + 1;
  const step = count > DENSE_AXIS_YEARS ? DENSE_AXIS_STEP : 1;
  const years = Array.from({ length: count }, (_, index) => firstYear + index).filter((_, i) => i % step === 0);
  return (
    <div className="career-axis" aria-hidden="true">
      {years.map((year) => (
        <span key={year} style={{ left: `${((year - firstYear) / count) * 100}%` }}>
          {year}
        </span>
      ))}
    </div>
  );
}

function Timeline({ strip }: { strip: CareerStrip }) {
  const description = strip.segments.map((segment) => `${segment.label}, ${segment.span}`).join("; ");
  return (
    <figure className="career-strip-wrap">
      <div
        className="career-strip"
        style={{ "--lanes": strip.laneCount } as CSSProperties}
        role="img"
        aria-label={`Timeline from ${strip.firstYear} to ${strip.lastYear}: ${description}`}
      >
        {strip.segments.map((segment, index) => (
          <div
            key={`${segment.label}-${index}`}
            className="career-bar"
            style={{
              left: `${segment.left}%`,
              width: `${segment.width}%`,
              top: `calc(${segment.lane} * var(--lane-height))`,
            }}
            title={`${segment.label}, ${segment.span}`}
          >
            <span className="career-bar-label">{segment.label}</span>
          </div>
        ))}
      </div>
      <YearAxis firstYear={strip.firstYear} lastYear={strip.lastYear} />
    </figure>
  );
}

// The blue tally: the code's own sum, written in the margin beside the roles it added up.
function Tally({ months, roleCount }: { months: number | null; roleCount: number }) {
  return (
    <div className="gnote gnote-blue">
      <p className="query-word">Total experience</p>
      <p className="tally-figure">{months === null ? "Unknown" : formatDuration(months)}</p>
      <p>
        {months === null
          ? "The roles have no usable dates."
          : `Added up from the dates of ${roleCount === 1 ? "1 role" : `${roleCount} roles`}, overlaps counted once.`}
      </p>
    </div>
  );
}

export function CareerLines({ experience, months, today = new Date() }: CareerLinesProps) {
  if (experience.length === 0) return null;
  const strip = careerStrip(experience, today);

  return (
    <section className="gblock career" aria-labelledby="career-heading">
      <div className="gbody">
        <h4 id="career-heading" className="gsec">
          Career
        </h4>
        {strip && (
          <div className="gl-wide career-figure">
            <Timeline strip={strip} />
          </div>
        )}
        <ol className="glist">
          {experience.map((job, index) => {
            const duration = roleDuration(job, today);
            return (
              <li key={`${job.company}-${index}`} className="gline">
                <p className="gl-label job-when">
                  {formatMonth(job.start)} to {formatMonth(job.end)}
                  {duration && <span className="block font-normal">{duration}</span>}
                </p>
                <div className="gl-value">
                  <p className="job-role">{job.role ?? "Role not given"}</p>
                  <p className="text-muted">{[job.company, job.location].filter(Boolean).join(", ")}</p>
                  {job.highlights.length > 0 && (
                    <ul className="highlights">
                      {job.highlights.map((highlight, highlightIndex) => (
                        <li key={`${highlight}-${highlightIndex}`}>{highlight}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <Tally months={months} roleCount={experience.length} />
      <span className="bracket" aria-hidden="true" />
    </section>
  );
}

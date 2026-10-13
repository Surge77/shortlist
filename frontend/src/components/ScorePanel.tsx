import type { RequirementResult, Score, ScoreCategory } from "../data/types";
import { formatScore, VERDICT_LABEL } from "../labels";
import { BandTag } from "./Tags";

const VERDICT_MARK = { met: "✓", partial: "½", missing: "✕" } as const;
const LIST_CATEGORIES: { category: ScoreCategory; title: string }[] = [
  { category: "must_have", title: "Must-have skills" },
  { category: "nice_to_have", title: "Nice-to-have skills" },
  { category: "education", title: "Field of study" },
  { category: "certifications", title: "Certifications" },
];
const PERCENT = 100;

// The score with its working shown: each category's share of 100 points, then every
// requirement with the verdict and the resume's own words behind it.
export function ScorePanel({ score }: { score: Score }) {
  const { categories, requirements, knockouts, flags } = score.breakdown;
  return (
    <section className="sheet stack" aria-labelledby="score-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="score-title" className="section-title mb-1">Fit score</h2>
          {score.total === null ? (
            <p className="meta">No score: the job has no requirements to score against.</p>
          ) : (
            <p>
              <span className="score-figure">{formatScore(score.total)}</span>
              <span className="meta"> / 100</span>
            </p>
          )}
        </div>
        {score.band && <BandTag band={score.band} />}
      </div>

      {flags.length > 0 && (
        <ul className="flags" aria-label="Check these">
          {flags.map((flag) => <li key={flag}>{flag}</li>)}
        </ul>
      )}

      {categories.length > 0 && (
        <ul className="grid gap-3" aria-label="How the score adds up">
          {categories.map((category) => (
            <li key={category.category}>
              <div className="flex justify-between gap-3 text-sm">
                <span className="font-semibold text-ink">{category.label}</span>
                <span className="tabular-nums">{category.points} / {category.max_points}</span>
              </div>
              <div className="bar" aria-hidden="true">
                <span style={{ width: `${category.credit * PERCENT}%` }} />
              </div>
              <p className="meta">{category.detail}</p>
            </li>
          ))}
        </ul>
      )}

      {knockouts.length > 0 && (
        <p>
          <span className="font-semibold text-ink">Missing must-haves:</span>{" "}
          <span className="verdict-missing font-semibold">{knockouts.join(", ")}</span>
          <span className="meta"> (flagged for you to judge, not an automatic rejection)</span>
        </p>
      )}

      {LIST_CATEGORIES.map(({ category, title }) => (
        <RequirementList key={category} title={title} items={requirements.filter((r) => r.category === category)} />
      ))}
    </section>
  );
}

function RequirementList({ title, items }: { title: string; items: RequirementResult[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="field-label">{title}</h3>
      <ul className="verdicts">
        {items.map((item) => (
          <li key={item.id}>
            <span className={`verdict-mark verdict-${item.verdict}`} aria-hidden="true">{VERDICT_MARK[item.verdict]}</span>
            <span>
              <span className="text-ink">{item.text}</span>
              <span className={`sr-only`}>: {VERDICT_LABEL[item.verdict]}</span>
              {item.verdict === "partial" && <span className="meta"> (partly)</span>}
              {item.unverified && <span className="meta"> (claimed evidence not found in the resume)</span>}
              {item.skills_only && <span className="meta"> (listed in skills only)</span>}
            </span>
            {item.evidence && <q className="evidence">{item.evidence}</q>}
          </li>
        ))}
      </ul>
    </div>
  );
}

import { VERDICT_MARK } from "../../components/ScorePanel";
import { BandTag, StageTag } from "../../components/Tags";
import { getApplicationDetail } from "../../data/applications";
import type { ApplicationDetail, RequirementResult } from "../../data/types";
import { candidateLabel } from "../../hr/applicants";
import { categoryRows, hasMixedVersions, requirementRows } from "../../hr/compare";
import { useBlindMode } from "../../hr/useBlindMode";
import { formatDuration } from "../../format";
import { formatScore, VERDICT_LABEL } from "../../labels";
import { Link } from "../../router";
import type { ApiResult } from "../../types";
import { useLoad } from "../../useLoad";

const CATEGORY_TITLE = { must_have: "Must-have", nice_to_have: "Nice-to-have", education: "Field of study",
  certifications: "Certification", experience: "Experience" } as const;

async function loadAll(jobId: string, ids: string[]): Promise<ApiResult<ApplicationDetail[]>> {
  const results = await Promise.all(ids.map(getApplicationDetail));
  const failed = results.find((result) => !result.ok);
  if (failed && !failed.ok) return failed;
  // A link can carry ids from another job; only this job's applications are compared.
  const details = results.flatMap((result) => (result.ok && result.data?.job.id === jobId ? [result.data] : []));
  return { ok: true, data: details };
}

export function Compare({ jobId, ids }: { jobId: string; ids: string[] }) {
  const { state } = useLoad(() => loadAll(jobId, ids), `${jobId}:${ids.join(",")}`);

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div>
          <p className="page-kicker">
            <Link to={`/hr/jobs/${jobId}`} className="link-button">Back to applicants</Link>
          </p>
          <h1 className="page-title">
            Compare candidates{state.status === "ready" && state.data[0] ? `: ${state.data[0].job.title}` : ""}
          </h1>
        </div>
      </header>
      {state.status === "loading" && <p className="meta">Loading…</p>}
      {state.status === "error" && <p className="notice notice-error">{state.message}</p>}
      {state.status === "ready" && state.data.length < 2 && (
        <p className="notice">Choose two or three applicants from the job's list to compare them.</p>
      )}
      {state.status === "ready" && state.data.length >= 2 && <CompareTable details={state.data} />}
    </div>
  );
}

function Verdict({ result }: { result: RequirementResult | null }) {
  if (!result) return <span className="meta">Not scored</span>;
  return (
    <div>
      <span className={result.verdict === "missing" ? "compare-missing" : "text-ink"}>
        <span aria-hidden="true">{VERDICT_MARK[result.verdict]} </span>
        {VERDICT_LABEL[result.verdict]}
      </span>
      {result.evidence && <q className="compare-quote">{result.evidence}</q>}
    </div>
  );
}

function CompareTable({ details }: { details: ApplicationDetail[] }) {
  const [isBlind] = useBlindMode();
  const requirements = requirementRows(details);
  const categories = categoryRows(details);

  return (
    <>
      {hasMixedVersions(details) && (
        <p className="notice mb-4">
          These scores were made against different versions of the requirements. Rescore them to compare like for like.
        </p>
      )}
      <div className="ledger-wrap">
        <table className="ledger compare">
          <thead>
            <tr>
              <th scope="col">Requirement</th>
              {details.map((detail) => (
                <th key={detail.id} scope="col">
                  <Link to={`/hr/applications/${detail.id}`} className="row-title">{candidateLabel(detail, isBlind)}</Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Fit score</th>
              {details.map((detail) => (
                <td key={detail.id}>
                  {detail.score?.total == null ? <span className="meta">No score</span> : (
                    <span className="inline-flex items-center gap-2">
                      <strong className="text-ink">{formatScore(detail.score.total)}</strong>
                      {detail.score.band && <BandTag band={detail.score.band} />}
                    </span>
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">Stage</th>
              {details.map((detail) => <td key={detail.id}><StageTag stage={detail.stage} /></td>)}
            </tr>
            <tr>
              <th scope="row">Total experience</th>
              {details.map((detail) => {
                const months = detail.extraction?.experience_months;
                return <td key={detail.id}>{months == null ? <span className="meta">Unknown</span> : formatDuration(months)}</td>;
              })}
            </tr>
            {requirements.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  <span className="meta">{CATEGORY_TITLE[row.category]}</span>
                  <br />
                  {row.text}
                </th>
                {row.cells.map((cell, index) => <td key={details[index].id}><Verdict result={cell} /></td>)}
              </tr>
            ))}
            {categories.map((row) => (
              <tr key={row.category}>
                <th scope="row">{row.label} points</th>
                {row.cells.map((cell, index) => (
                  <td key={details[index].id}>
                    {cell ? `${formatScore(cell.points)} / ${cell.max_points}` : <span className="meta">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

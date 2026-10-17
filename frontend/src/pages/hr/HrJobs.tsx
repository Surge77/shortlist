import { JobStatusTag } from "../../components/Tags";
import { listHrJobs } from "../../data/jobs";
import { formatDate } from "../../labels";
import { Link } from "../../router";
import { useLoad } from "../../useLoad";
import { jobMeta } from "../JobBoard";

export function HrJobs() {
  const { state } = useLoad(listHrJobs, "hr-jobs");

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div>
          <p className="page-kicker">HR</p>
          <h1 className="page-title">Jobs and applicants</h1>
        </div>
        <Link to="/hr/jobs/new" className="btn-primary">
          New job
        </Link>
      </header>
      {state.status === "loading" && <p className="meta">Loading jobs…</p>}
      {state.status === "error" && <p className="notice notice-error">{state.message}</p>}
      {state.status === "ready" && state.data.length === 0 && (
        <p className="notice">No jobs yet. Create one to start taking applications.</p>
      )}
      {state.status === "ready" && state.data.length > 0 && (
        <div className="ledger-wrap">
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">Job</th>
                <th scope="col">Status</th>
                <th scope="col">Applicants</th>
                <th scope="col">Requirements</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((job) => (
                <tr key={job.id}>
                  <td>
                    <Link to={`/hr/jobs/${job.id}`} className="row-title">
                      {job.title}
                    </Link>
                    <p className="meta">{jobMeta(job)}</p>
                  </td>
                  <td>
                    <JobStatusTag status={job.status} />
                  </td>
                  <td>{job.applicant_count}</td>
                  <td>
                    {job.requirements ? (
                      <span className="meta">Version {job.requirements_version}</span>
                    ) : (
                      <span className="tag tag-red">Not approved</span>
                    )}
                  </td>
                  <td className="meta">{formatDate(job.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

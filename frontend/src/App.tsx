import type { ReactNode } from "react";

import { AuthProvider } from "./auth/AuthProvider";
import { RequireRole } from "./components/RequireRole";
import { SiteHeader } from "./components/SiteHeader";
import { AuthPage } from "./pages/AuthPage";
import { Applicants } from "./pages/hr/Applicants";
import { parseCompareIds } from "./hr/compare";
import { ApplicationReview } from "./pages/hr/ApplicationReview";
import { Compare } from "./pages/hr/Compare";
import { HrDashboard } from "./pages/hr/HrDashboard";
import { HrJobs } from "./pages/hr/HrJobs";
import { JobEditor } from "./pages/hr/JobEditor";
import { QuickExtract } from "./pages/hr/QuickExtract";
import { JobBoard } from "./pages/JobBoard";
import { JobDetail } from "./pages/JobDetail";
import { MyApplications } from "./pages/MyApplications";
import { Profile } from "./pages/Profile";
import { Link, matchPath, useLocation } from "./router";

type Params = Record<string, string>;

interface Route {
  pattern: string;
  render: (params: Params, search: URLSearchParams, path: string) => ReactNode;
}

const hr = (path: string, page: ReactNode) => <RequireRole role="hr" path={path}>{page}</RequireRole>;
const candidate = (path: string, page: ReactNode) => <RequireRole role="candidate" path={path}>{page}</RequireRole>;

// Order matters where patterns overlap: "/hr/jobs/new" must win over "/hr/jobs/:id".
export const ROUTES: Route[] = [
  { pattern: "/", render: () => <JobBoard /> },
  { pattern: "/jobs", render: () => <JobBoard /> },
  { pattern: "/jobs/:id", render: (p) => <JobDetail jobId={p.id} /> },
  { pattern: "/login", render: (_, search) => <AuthPage mode="login" next={search.get("next")} /> },
  { pattern: "/signup", render: () => <AuthPage mode="signup" next={null} /> },
  { pattern: "/me/applications", render: (_, __, path) => candidate(path, <MyApplications />) },
  { pattern: "/me/profile", render: (_, __, path) => candidate(path, <Profile />) },
  { pattern: "/hr", render: (_, __, path) => hr(path, <HrDashboard />) },
  { pattern: "/hr/jobs", render: (_, __, path) => hr(path, <HrJobs />) },
  { pattern: "/hr/extract", render: (_, __, path) => hr(path, <QuickExtract />) },
  { pattern: "/hr/jobs/new", render: (_, __, path) => hr(path, <JobEditor jobId={null} />) },
  {
    pattern: "/hr/jobs/:id/compare",
    render: (p, search, path) => {
      const ids = parseCompareIds(search.get("ids"));
      return hr(path, <Compare key={`${p.id}:${ids.join(",")}`} jobId={p.id} ids={ids} />);
    },
  },
  { pattern: "/hr/jobs/:id/edit", render: (p, __, path) => hr(path, <JobEditor key={p.id} jobId={p.id} />) },
  { pattern: "/hr/jobs/:id", render: (p, __, path) => hr(path, <Applicants key={p.id} jobId={p.id} />) },
  { pattern: "/hr/applications/:id", render: (p, __, path) => hr(path, <ApplicationReview key={p.id} applicationId={p.id} />) },
];

function CurrentPage() {
  const { path, search } = useLocation();
  for (const route of ROUTES) {
    const params = matchPath(route.pattern, path);
    if (params) return <>{route.render(params, search, path)}</>;
  }
  return (
    <div className="page">
      <h1 className="page-title">Page not found</h1>
      <p className="mt-3">
        <Link to="/jobs" className="link-button">Go to open jobs</Link>
      </p>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <div className="flex min-h-dvh flex-col">
        <SiteHeader />
        <div className="flex-1">
          <CurrentPage />
        </div>
        <footer className="site-footer">
          <p>Shortlist · Scores assist HR; people decide.</p>
        </footer>
      </div>
    </AuthProvider>
  );
}

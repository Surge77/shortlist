import { useAuth } from "../auth/AuthProvider";
import { displayName } from "../format";
import { Link, navigate, useLocation } from "../router";
import { LogoMark } from "./icons";
import { ThemeToggle } from "./ThemeToggle";

interface NavItem {
  to: string;
  label: string;
}

const PUBLIC_NAV: NavItem[] = [{ to: "/jobs", label: "Jobs" }];
const CANDIDATE_NAV: NavItem[] = [...PUBLIC_NAV, { to: "/me/applications", label: "My applications" }];
const HR_NAV: NavItem[] = [
  { to: "/hr", label: "Jobs & applicants" },
  { to: "/hr/extract", label: "Quick extract" },
  { to: "/jobs", label: "Public board" },
];

function isCurrent(item: NavItem, path: string): boolean {
  if (item.to === "/hr") return path === "/hr" || (path.startsWith("/hr/") && !path.startsWith("/hr/extract"));
  if (item.to === "/jobs") return path === "/" || path.startsWith("/jobs");
  return path.startsWith(item.to);
}

// The slug line a galley carries along its top edge: whose proof it is and where you are.
export function SiteHeader() {
  const { auth, signOut } = useAuth();
  const { path } = useLocation();
  const isSignedIn = auth.status === "signedIn";
  const items = isSignedIn ? (auth.role === "hr" ? HR_NAV : CANDIDATE_NAV) : PUBLIC_NAV;

  async function handleSignOut() {
    await signOut();
    navigate("/jobs");
  }

  return (
    <header className="slug">
      <div className="slug-inner">
        <Link to={isSignedIn && auth.role === "hr" ? "/hr" : "/jobs"} className="wordmark">
          <LogoMark />
          Shortlist
        </Link>
        <nav aria-label="Main" className="nav-links">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="nav-link"
              aria-current={isCurrent(item, path) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="slug-actions">
          {isSignedIn ? (
            <>
              <span className="slug-user hidden md:inline">
                {displayName(auth.fullName ?? auth.email)}
                {auth.role === "hr" && " · HR"}
              </span>
              <button type="button" className="btn-outline" onClick={() => void handleSignOut()}>
                Sign out
              </button>
            </>
          ) : (
            auth.status === "signedOut" && (
              <Link to="/login" className="btn-outline">
                Sign in
              </Link>
            )
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

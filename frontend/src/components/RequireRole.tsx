import type { ReactNode } from "react";

import { useAuth } from "../auth/AuthProvider";
import type { Role } from "../data/types";
import { NOT_CONFIGURED } from "../lib/supabase";
import { Link } from "../router";

interface RequireRoleProps {
  role: Role;
  path: string;
  children: ReactNode;
}

// The UI half of access control; row-level security in the database is the real boundary.
export function RequireRole({ role, path, children }: RequireRoleProps) {
  const { auth } = useAuth();
  switch (auth.status) {
    case "unconfigured":
      return <Gate>{NOT_CONFIGURED}</Gate>;
    case "loading":
      return <Gate>Checking your account…</Gate>;
    case "signedOut":
      return (
        <Gate>
          Sign in to see this page.{" "}
          <Link to={`/login?next=${encodeURIComponent(path)}`} className="link-button">
            Sign in
          </Link>
        </Gate>
      );
    case "signedIn":
      if (auth.role !== role) {
        return <Gate>{role === "hr" ? "This page is for HR accounts." : "This page is for candidate accounts."}</Gate>;
      }
      return <>{children}</>;
  }
}

function Gate({ children }: { children: ReactNode }) {
  return (
    <div className="page">
      <p className="notice" role="status">
        {children}
      </p>
    </div>
  );
}

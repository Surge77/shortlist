import { useState, type FormEvent } from "react";

import { getAuthOptions } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { DemoSignIn } from "../components/DemoSignIn";
import { Link, navigate } from "../router";
import { useLoad } from "../useLoad";

const MIN_PASSWORD_CHARS = 8;

type Mode = "login" | "signup";
type Phase = { kind: "editing"; problem: string | null } | { kind: "busy" } | { kind: "checkEmail" };

// Only same-site paths are followed after sign-in, so a crafted link can't bounce
// someone to another site. "//host" and "/\host" are both read by browsers as another host.
export function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : null;
}

export function AuthPage({ mode, next }: { mode: Mode; next: string | null }) {
  const { state } = useLoad(getAuthOptions, "auth-options");
  if (state.status === "loading") return <div className="page meta">Loading…</div>;
  // Demo mode replaces both sign-in and sign-up; if the server can't say, offer passwords.
  if (state.status === "ready" && state.data.demo) return <DemoSignIn options={state.data} next={safeNext(next)} />;
  return <PasswordAuth mode={mode} next={next} />;
}

function PasswordAuth({ mode, next }: { mode: Mode; next: string | null }) {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "editing", problem: null });
  const isSignup = mode === "signup";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) return setPhase({ kind: "editing", problem: "Enter your email and password." });
    if (isSignup && !fullName.trim()) return setPhase({ kind: "editing", problem: "Enter your name." });
    if (isSignup && password.length < MIN_PASSWORD_CHARS) {
      return setPhase({ kind: "editing", problem: `Use at least ${MIN_PASSWORD_CHARS} characters for the password.` });
    }
    setPhase({ kind: "busy" });
    if (isSignup) {
      const result = await signUp(email.trim(), password, fullName.trim());
      setPhase(result.ok ? { kind: "checkEmail" } : { kind: "editing", problem: result.message });
      return;
    }
    const result = await signIn(email.trim(), password);
    if (!result.ok) return setPhase({ kind: "editing", problem: result.message });
    navigate(safeNext(next) ?? "/", { replace: true });
  }

  if (phase.kind === "checkEmail") {
    return (
      <div className="page max-w-xl">
        <h1 className="page-title">Check your email</h1>
        <p className="mt-3">
          We sent a confirmation link to {email}. Open it, then{" "}
          <Link to="/login" className="link-button">
            sign in
          </Link>
          .
        </p>
      </div>
    );
  }

  const isBusy = phase.kind === "busy";
  return (
    <div className="page max-w-xl">
      <header className="page-head">
        <h1 className="page-title">{isSignup ? "Create a candidate account" : "Sign in"}</h1>
      </header>
      <form className="form-grid sheet" onSubmit={(event) => void submit(event)} noValidate>
        {isSignup && (
          <label className="field">
            <span className="field-label">Full name</span>
            <input className="input" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
        )}
        <label className="field">
          <span className="field-label">Email</span>
          <input
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input
            className="input"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {phase.kind === "editing" && phase.problem && (
          <p className="problem" role="alert">
            {phase.problem}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" className="btn-primary" disabled={isBusy}>
            {isBusy ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
          </button>
          {isSignup ? (
            <Link to="/login" className="link-button">
              I already have an account
            </Link>
          ) : (
            <Link to="/signup" className="link-button">
              Create a candidate account
            </Link>
          )}
        </div>
        {!isSignup && <p className="field-hint">HR accounts are created by your administrator.</p>}
      </form>
    </div>
  );
}

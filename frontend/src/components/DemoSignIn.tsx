import { useId, useState, type FormEvent } from "react";

import type { AuthOptions } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { navigate } from "../router";

type Phase = { kind: "editing"; problem: string | null } | { kind: "busy"; email: string };

// Demo mode: an email is all it takes. HR emails come from the server's allowlist; any
// other email gets a candidate account the first time it is used.
export function DemoSignIn({ options, next }: { options: AuthOptions; next: string | null }) {
  const { signInWithEmail } = useAuth();
  const fieldId = useId();
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "editing", problem: null });
  const isBusy = phase.kind === "busy";

  async function signInAs(address: string, fallback: string) {
    const clean = address.trim();
    if (!clean) return setPhase({ kind: "editing", problem: "Enter your email." });
    setPhase({ kind: "busy", email: clean });
    const result = await signInWithEmail(clean);
    if (!result.ok) return setPhase({ kind: "editing", problem: result.message });
    navigate(next ?? fallback, { replace: true });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void signInAs(email, "/");
  }

  return (
    <div className="page max-w-xl">
      <header className="page-head">
        <div>
          <p className="page-kicker">Demo</p>
          <h1 className="page-title">Sign in with your email</h1>
        </div>
      </header>
      <form className="form-grid sheet" onSubmit={submit} noValidate>
        <div className="field">
          <label className="field-label" htmlFor={`${fieldId}-email`}>Email</label>
          <input id={`${fieldId}-email`} className="input" type="email" autoComplete="email" value={email}
            disabled={isBusy} aria-describedby={`${fieldId}-hint`} onChange={(e) => setEmail(e.target.value)} />
          <span id={`${fieldId}-hint`} className="field-hint">No password. A new email becomes a candidate account.</span>
        </div>
        {phase.kind === "editing" && phase.problem && <p className="problem" role="alert">{phase.problem}</p>}
        <div>
          <button type="submit" className="btn-primary" disabled={isBusy}>
            {isBusy && phase.email === email.trim() ? "Signing in…" : "Continue"}
          </button>
        </div>
      </form>

      {(options.hr_email || options.candidate_email) && (
        <section className="sheet mt-6" aria-labelledby="quick-heading">
          <h2 id="quick-heading" className="section-title">Quick demo</h2>
          <div className="flex flex-wrap gap-3">
            {options.hr_email && (
              <button type="button" className="btn-outline" disabled={isBusy}
                onClick={() => void signInAs(options.hr_email ?? "", "/hr")}>
                Sign in as HR
              </button>
            )}
            {options.candidate_email && (
              <button type="button" className="btn-outline" disabled={isBusy}
                onClick={() => void signInAs(options.candidate_email ?? "", "/jobs")}>
                Sign in as candidate
              </button>
            )}
          </div>
          <p className="field-hint mt-3">
            Demo data is fictional and resets often. Don't upload a real resume.
          </p>
        </section>
      )}
    </div>
  );
}

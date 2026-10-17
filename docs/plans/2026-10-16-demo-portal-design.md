# Demo portal: email-only login, richer data, new HR and candidate tools, Render deploy

Agreed 2026-10-16. Goal: a public demo anyone can open and use in seconds, without
weakening the access rules the database enforces.

## 1. Email-only demo login

- `DEMO_LOGIN=true` turns it on (off by default; password login is unchanged when off).
- `POST /api/auth/demo-login {email}`: validates the email, creates the account if needed
  (admin API, `email_confirm: true`), sets `profiles.role` from `DEMO_HR_EMAILS` (the
  allowlist is the single source of truth), and returns a one-time `hashed_token` from
  `admin/generate_link`. The browser exchanges it with `verifyOtp`, so the session is a
  normal Supabase session and every RLS policy still applies.
- `GET /api/auth/options` tells the frontend whether demo login is on and which emails the
  one-click buttons use. Runtime, so no rebuild to switch modes.
- Rate limited per client IP. Trade-off, accepted for a demo with fictional data: anyone
  who knows an HR email can sign in as HR.

## 2. Demo data, seed and reset

- `backend/app/demo/fixtures.json`: 16 jobs (15 open across 11 departments, 1 draft),
  10 fictional candidates, about 22 applications with stages, history and HR notes.
  Fixed ids (`uuid5`) make seeding idempotent.
- Resumes are committed PDFs (`backend/app/demo/resumes/`), printed once from HTML with
  headless Edge by `backend/scripts/build_demo_resumes.py` (no new dependency).
- `python -m app.demo.seed` (run once, locally): reset + score every unscored seeded
  application with the real pipeline, one at a time.
- `POST /api/demo/reset` (HR, demo mode): deletes everything the audience created and
  restores seeded stages, notes, jobs and the candidate's saved resume. No Gemini calls.

## 3. HR overview and compare

- `/hr` becomes an overview: headline counts, stage funnel, per-job table (applicants,
  average score, strong fits), newest applications, and the reset control in demo mode.
  The jobs ledger moves to `/hr/jobs`.
- `/hr/jobs/:id/compare?ids=a,b,c`: up to three applicants side by side, one row per
  requirement with verdict and evidence, then category points and total. Blind mode applies.

## 4. Candidate tools

- Saved resume on the profile (`/me/profile`): upload once, replace, view.
  New columns on `profiles`, written only by the API.
- Apply with the saved resume in one click; the file is copied to the application so later
  replacements never change what HR reviewed.
- Job board filters by department and location.

## 5. Deploy

Render free web service from `render.yaml` (Docker, one origin). GitHub private repo,
Supabase stays the database. Free-plan sleep after 15 minutes idle: open the site a minute
before presenting.

## Testing

pytest (fakes for Supabase), Vitest + Testing Library, PGlite RLS tests for the new
columns, then a live seed and a browser walk-through on the deployed URL.

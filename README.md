# Shortlist

A small hiring portal. Candidates browse jobs and apply with a resume; HR reviews each
application against the job's requirements with an **explainable fit score**.

The model reads; code does the arithmetic and the checking. The score assists HR and never
rejects anyone on its own.

## How an application is scored

| Step | Who does it | What happens |
|---|---|---|
| 1. Requirements | Gemini drafts, **HR approves** | The job description becomes must-haves, nice-to-haves, minimum years, education and certifications. HR edits them and sets category weights. Scoring only uses approved requirements. |
| 2. Extraction | Gemini | The resume (PDF, DOCX or image) becomes a structured record. Python computes total experience from the dates and flags missing or malformed details. |
| 3. Evidence | Gemini, **blind** | Name, contact details and links are removed. For each requirement the model says met, partial or missing and **quotes the resume line** that shows it. It never produces a number. |
| 4. Verification | Python | Every quote is looked up in the record. A quote that isn't there counts as missing and is flagged. This also defeats resumes written to talk the model into a better verdict. |
| 5. Score | Python | Each category earns 0 to 1. Categories the job doesn't ask about drop out, and the rest share 100 points by weight. Missing must-haves are flagged as knockouts, never auto-rejections. |

Scores carry the requirements version they were made with. After HR changes the
requirements, older scores are marked stale and can be rescored in one click.

## What each side can do

**Candidates:** browse open jobs and filter them by text, team, location and type; sign up;
keep a saved resume on their profile and apply in one click, or upload a file per job; add an
optional cover note; follow each application's status and withdraw while it's undecided.
Candidates never see scores. This is enforced by the database, not just hidden in the UI.

**HR:** an overview of every job (headline counts, a stage funnel, newest applications, each
job's average score and strong fits); create, publish and close jobs; draft and approve
requirements; compare up to three applicants side by side, requirement by requirement with the
evidence quotes; see applicants ranked
by score with filters (fit, stage, missing must-haves), blind review, and CSV export. On the
review page: the score's working beside the extracted record and the original file, stage
changes (audited), private notes, history, and rescoring. HR also has a quick-extract tool
for reading a single resume.

## Architecture

```
React (Vite) ──supabase-js──► Supabase: Auth · Postgres with row-level security · private "resumes" bucket
      │ session token
      └──────────────► FastAPI ──► Gemini
                         · checks the token with Supabase Auth, reads the role from profiles
                         · validates each upload from its bytes before storing it
                         · background task: extract → match → verify → score → save
```

- `supabase/migrations/`: schema, row-level security, audited stage-change functions, storage policy.
- `backend/app/`: `scoring.py` (pure arithmetic), `matching.py` (redaction, evidence, quote checks),
  `requirements.py`, `pipeline.py`, `routes/`, plus the original extractor modules.
- `frontend/src/`: `pages/` (candidate and `hr/`), `data/` (Supabase queries), `hr/` (table logic).

## Setup

1. **Supabase.** Create a project. In the SQL editor, run the files in `supabase/migrations/`
   in order. In Authentication settings, keep email confirmation on.
2. **Backend.** In `backend/`:
   ```sh
   python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt   # .venv/bin on macOS/Linux
   ```
   Create `backend/.env`:
   ```
   GEMINI_API_KEY=...
   SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=...    # server only; bypasses row-level security
   CORS_ORIGINS=                    # only if the frontend is on another origin
   EXTRA_ALLOWED_HOSTS=             # only when deployed: the API's hostname
   ```
3. **Frontend.** In `frontend/`, run `pnpm install`, then create `frontend/.env.local`:
   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=...       # public by design; RLS protects the data
   VITE_API_URL=                    # empty when the API is same-origin
   ```
4. **HR account and demo jobs.** Sign up in the app with the HR person's email. Edit the email
   in `supabase/seed.sql`, then run it in the SQL editor. It promotes that account to HR and
   adds three fictional open jobs.

## Demo mode

For a public class demo, `DEMO_LOGIN=true` replaces passwords with an email box and two
one-click buttons. Every name, company and email in the demo data is fictional; don't let anyone
upload a real resume while it is on.

| Variable | Example | Meaning |
|---|---|---|
| `DEMO_LOGIN` | `true` | Turns email-only sign-in on. Off when unset. |
| `DEMO_HR_EMAILS` | `hr.demo@example.com` | Comma-separated. These emails sign in as HR; every other email signs in as a candidate, and a new email gets an account. |
| `DEMO_CANDIDATE_EMAIL` | `riya.demo@example.com` | The account behind "Sign in as candidate". |

How it stays safe enough for a demo: the API creates the account if needed, sets its role from
the allowlist, and returns a one-time token; the browser turns it into an ordinary Supabase
session with `verifyOtp`. Row-level security still applies to every query. The trade-off is
deliberate: anyone who knows an HR email can sign in as HR, so the mode is off by default.

> **Never turn demo mode on for a Supabase project with real users.** Demo sign-in issues a
> session for any existing email, and reset deletes every account that isn't in the seed or the
> HR allowlist. Give the demo its own Supabase project.

**Seed data.** `backend/app/demo/fixtures.json` holds 17 jobs across 11 departments (one a draft,
for showing the requirement builder), 11 candidates and 23 applications with stage history and
notes. The resumes are PDFs in `backend/app/demo/resumes/`, printed from
`backend/scripts/demo_resumes/*.txt` by `python scripts/build_demo_resumes.py` (headless Edge).
Load it, and score every application with the real pipeline, from your machine:

```sh
cd backend && .venv/Scripts/python -m app.demo.seed
```

It is safe to run again. **Reset:** on the HR overview, "Reset demo data" deletes everything the
audience added (accounts, jobs, applications, files) and restores the seeded state in seconds,
without calling Gemini.

## Run

```sh
cd backend && .venv/Scripts/uvicorn app.main:app --reload      # http://127.0.0.1:8000
cd frontend && pnpm dev                                         # http://localhost:5173, proxies /api
```

For a one-process demo, run `pnpm build` in `frontend/`. FastAPI then serves the built app
from the same origin.

## Tests

```sh
cd backend && .venv/Scripts/python -m pytest --cov=app && .venv/Scripts/python -m pyright
cd frontend && pnpm typecheck && pnpm coverage
cd supabase/tests && pnpm install && pnpm test    # migrations + RLS on real Postgres (PGlite)
```

The database tests run every access rule as a signed-out visitor, two candidates and HR. For
example: a candidate can't read scores or another candidate's application, can't promote
themselves to HR, and can't change a stage except by withdrawing.

## Deploy

**Render (free), as configured in `render.yaml`:** one Docker web service that builds the
frontend and serves it from FastAPI.

1. Push the branch to GitHub (`render.yaml` deploys `feature/hiring-portal`).
2. In Render: New → Blueprint → pick the repository. Render reads `render.yaml`.
3. Enter the secret values when asked: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `GEMINI_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. The demo settings are already
   in the file.
4. Run the seed once from your machine (above), then open the `onrender.com` URL.

The free plan sleeps after 15 minutes without visitors and takes about a minute to wake, so open
the site shortly before presenting. Supabase's free plan pauses a project after a week without
activity; restore it from the Supabase dashboard if that happens.

Other options:

- **One service:** build the frontend, then run FastAPI (Railway, Render, a VM). Same origin,
  so no CORS. Set `EXTRA_ALLOWED_HOSTS` to the public hostname.
- **Split:** frontend on Vercel (`frontend/vercel.json` handles deep links) with `VITE_API_URL`
  pointing at the API, and the API's `CORS_ORIGINS` set to the Vercel URL. Serverless functions
  are a poor fit for the background scoring task; use a long-running host for the API.

## Limits and honesty

- Gemini's free tier may use uploads to improve Google's products. Demo with fictional or consented resumes only.
- Extraction and evidence come from a model and can be wrong. Quote checks catch fabricated
  evidence, not misjudged evidence. The original resume is always one click away.
- Degree levels are read from the degree's name by rules (B.Sc., M.Tech, Ph.D., ...). An unusual
  title may read as "not stated", which the score shows.

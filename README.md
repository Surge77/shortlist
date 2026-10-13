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

**Candidates:** browse and search open jobs, sign up, apply once per job with a resume and an
optional cover note, follow each application's status, withdraw while it's undecided.
Candidates never see scores. This is enforced by the database, not just hidden in the UI.

**HR:** create, publish and close jobs; draft and approve requirements; see applicants ranked
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

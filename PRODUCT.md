# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two sides of one hiring flow.

- **HR (recruiter):** posts jobs and screens many applications a day in fast passes, deciding who moves forward. Works on a desktop, comparing each candidate's record and evidence against the job's requirements, with the original resume beside it.
- **Candidate:** browses open jobs, applies with a resume, and follows the status of each application.

A secondary audience is the class demo: a mentor and classmates watching a candidate apply and HR review the scored application live.

## Product Purpose

Shortlist is a small hiring portal. Candidates apply to jobs with a resume; HR sees, for each application, a structured candidate record and an explainable fit score against the job's requirements. Success is a recruiter knowing, within seconds, how well an application fits the role, why, and what is missing, without retyping anything or trusting an opaque number.

## Positioning

The model only reads; code does the arithmetic and the checking. Gemini turns the job description into structured requirements that HR approves, extracts the resume into a record, and points to the resume line that shows each requirement is met. Python verifies every quote exists, computes total experience from the dates, and adds up the weighted score. The score assists HR; it never accepts or rejects anyone on its own.

## Operating Context

- Candidates: public job board; login to apply; one application per job; resume upload (PDF, DOCX, PNG, JPG, WebP, up to 5 MB) and an optional cover note.
- HR: create jobs, approve requirements and weights, review applications, move stages, keep notes.
- Supabase holds accounts, jobs, applications and resume files; FastAPI holds the Gemini and scoring logic; React frontend.
- Built for a class project and demo.

## Capabilities and Constraints

- Requirements per job: must-have skills, nice-to-have skills, minimum years, education, certifications. HR edits and approves them before scoring runs.
- Score 0–100 from weighted categories, with a band (Strong, Possible, Weak), per-requirement verdicts (met, partial, missing) and the evidence quote for each.
- Scoring runs blind: name, contact details and links are removed before matching.
- Data-quality warnings (missing email, malformed phone, undated jobs) are shown beside the score, never mixed into it.
- Candidates see application status only. Scores, notes and extractions are HR-only, enforced by database row-level security.
- On Gemini's free tier, uploads may be used by Google; demos use fictional resumes only.

## Brand Commitments

Name: Shortlist. Must not look like PlainSpeak, its sibling project (same author, same course). Must not feel playful or gimmicky: recruiters need to trust the data and the score, and candidates need to trust the process.

## Evidence on Hand

A fictional sample resume (frontend/src/sample.ts: "Riya Kulkarni", example.com email, invented companies). Demo jobs and resumes are fictional too. No real resumes, customers or metrics; none may be invented.

## Product Principles

1. The score assists; a person decides. No automatic rejection.
2. Every point is traceable to a quote from the resume or a computed number.
3. Score blind: who the candidate is never changes how they match.
4. Flag gaps plainly; never hide or soften a missing requirement or detail.
5. The original resume is always one glance away.

## Accessibility & Inclusion

Keyboard-complete flow, visible focus, screen-reader status announcements, WCAG AA contrast in light and dark themes, for both candidate and HR screens.

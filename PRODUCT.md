# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A recruiter screening a pile of resumes: many a day, in fast passes, deciding who moves forward. They read on a desktop at work, comparing the extracted record with the original document. A secondary audience is the class demo: a mentor and classmates watching one resume processed live.

## Product Purpose

Shortlist turns a resume (PDF, Word, image or pasted text) into a structured candidate record a recruiter can trust and act on. Success is a recruiter knowing, within seconds, who the candidate is and how to reach them, how their career adds up, what skills they list, and what is missing or malformed, without retyping anything.

## Positioning

The model only reads; code does the arithmetic and the checking. Total experience is computed from the extracted dates with overlaps counted once, and missing or malformed details are flagged by rules, so the record shows what the resume actually says and where it falls short, rather than an AI's opinion of the candidate. No fit scores, no rankings.

## Operating Context

- One resume at a time: upload (PDF, DOCX, PNG, JPG, WebP, up to 5 MB) or paste text (up to 30,000 characters).
- The original stays beside the record for verification.
- The record can be copied or downloaded as JSON for other HR tools.
- Runs locally (FastAPI + React) with a Gemini key; built for a class project and demo.

## Capabilities and Constraints

- One Gemini call per resume with a fixed response schema: contact, headline, summary, skills (technical, tools, soft), experience, education, projects, certifications, achievements, languages.
- Server-side: experience total, email/phone validation, missing-detail warnings, non-resume detection.
- Not built: job-description matching, batch processing, candidate storage, accounts.
- On Gemini's free tier, uploads may be used by Google; demos use the fictional sample resume.

## Brand Commitments

Name: Shortlist. Must not look like PlainSpeak, its sibling project (same author, same course). Must not feel playful or gimmicky: recruiters need to trust the extracted data.

## Evidence on Hand

A fictional sample resume (frontend/src/sample.ts: "Riya Kulkarni", example.com email, invented companies). No real resumes, customers or metrics; none may be invented.

## Product Principles

1. Show what the resume says, never judge the candidate.
2. Every computed number is explainable (how the total was added up).
3. Flag gaps plainly; never hide or soften a missing detail.
4. The original is always one glance away.

## Accessibility & Inclusion

Keyboard-complete flow, visible focus, screen-reader status announcements, WCAG AA contrast in light and dark themes.

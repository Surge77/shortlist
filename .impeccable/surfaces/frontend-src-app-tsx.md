---
version: 1
slug: "frontend-src-app-tsx"
primary_target: "frontend/src/App.tsx"
related_targets: []
---

## Surface

The Shortlist workspace (frontend/src/App.tsx): one screen where a recruiter uploads or pastes a resume and reads the extracted candidate record beside the original. Visitor mode: Operate.

## Audience and job

A recruiter screening a pile of resumes. In the first seconds after extraction they need: who the candidate is and how to reach them, the career at a glance, what is missing or malformed, and the skills.

## Direction contract

THESIS: The candidate record is a printer's galley proof that the recruiter reads against the manuscript (the resume). Gemini sets the type; code proofreads it. Every check is a real proof mark in a ruled margin, level with the line it marks. Refuses the ATS dashboard of soft cards, avatars, pill tags and scores.

OWN-WORLD: Cool galley stock (#f7f8f5 sheet on a #e6e8e3 desk), black type (#151515), one-pixel hairlines (#b9bdb5), square corners everywhere. Two proof pencils with fixed jobs: blue #1e56c8 marks only what code worked out (the experience tally and its bracket, "checks passed"); red #c81e17 marks only what the recruiter must query (missing or malformed details, the Worth checking list, form problems) and appears nowhere else, so the primary action is ink. Hanken Grotesk for all type (800 for the name, italic for margin notes); Courier Prime only for the manuscript (pasted resume, Word text), line numbers and the JSON. Numbered lines in a left gutter; a ruled proof margin on the right.

STORY: The recruiter drops or pastes a resume into the manuscript sheet on the left and extracts; the galley on the right sets the record line by line; proof marks are pencilled in: a red caret and line out to the margin where a detail is missing, a red underline where one is malformed, a blue bracket and tally beside the career. They read the margin first (Worth checking, the total), scan the lines, and copy or download the JSON.

FIRST VIEWPORT: A slug line across the top (caret mark and "Shortlist", "Read by Gemini. Added up and checked by code.", New resume, theme). Below at desktop: left, the manuscript sheet (Resume: upload/paste, ink Extract details) with the Original beneath for files; right, "Candidate record" with Profile/JSON tabs above the galley: name in heavy grotesque with Worth checking in the margin beside it, then contact lines, summary, career (timeline, roles, blue tally), skills, education and credentials. A narrow galley (container under 46rem) folds the margin in so each note follows its line.

FORM: Galley Proof, the assigned roll (seed key e02bf043), rebuilt from mockup D after the user compared it with the built Coupon Wallet and five other strong fits and chose it.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature interaction

When a record lands, the proof marks are pencilled in: carets stroke on, query lines rule out to the margin, the tally bracket draws down, and the margin notes are written left to right (clip-path). The galley text itself is visible from the first frame. All of it is skipped under reduced motion.

-- A candidate's saved resume, reused for one-click applications. Stored in the resumes
-- bucket under the candidate's own folder, so the existing storage policy already lets
-- them (and HR) read it. Written only by the API: the authenticated role may update
-- full_name on profiles and nothing else, which leaves these columns read-only to browsers.

alter table public.profiles
  add column resume_path text,
  add column resume_source_type text check (resume_source_type in ('pdf', 'docx', 'image')),
  add column resume_filename text check (char_length(resume_filename) <= 200),
  add column resume_updated_at timestamptz,
  add constraint saved_resume_complete check ((resume_path is null) = (resume_source_type is null));

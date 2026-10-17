-- Shortlist schema: who people are, the jobs HR posts, the applications candidates send,
-- and the HR-only review data (extraction, score, notes, stage history).

create type public.app_role as enum ('candidate', 'hr');
create type public.job_status as enum ('draft', 'open', 'closed');
create type public.employment_type as enum ('full_time', 'part_time', 'contract', 'internship');
create type public.application_stage as enum
  ('submitted', 'reviewing', 'shortlisted', 'rejected', 'hired', 'withdrawn');
create type public.processing_status as enum ('processing', 'scored', 'failed');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'candidate',
  full_name text check (char_length(full_name) <= 120),
  created_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references public.profiles (id),
  title text not null check (char_length(title) between 3 and 120),
  department text check (char_length(department) <= 80),
  location text check (char_length(location) <= 120),
  employment_type public.employment_type not null default 'full_time',
  description text not null check (char_length(description) between 20 and 20000),
  status public.job_status not null default 'draft',
  -- Written only by the API, which validates the shape; null until HR approves them.
  requirements jsonb,
  requirements_version integer not null default 0,
  weights jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Scoring runs against the approved requirements, so a job without them cannot open.
  constraint open_jobs_have_requirements check (status = 'draft' or requirements is not null)
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  resume_path text not null,
  resume_sha256 text not null check (resume_sha256 ~ '^[0-9a-f]{64}$'),
  source_type text not null check (source_type in ('pdf', 'docx', 'image')),
  cover_note text check (char_length(cover_note) <= 2000),
  stage public.application_stage not null default 'submitted',
  processing_status public.processing_status not null default 'processing',
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, candidate_id)
);

create index applications_candidate_id_idx on public.applications (candidate_id);

create table public.extractions (
  application_id uuid primary key references public.applications (id) on delete cascade,
  record jsonb not null,
  experience_months integer,
  warnings jsonb not null default '[]',
  invalid_fields jsonb not null default '[]',
  source_text text,
  prompt_version text not null,
  created_at timestamptz not null default now()
);

-- One row per application: a rescore replaces it, carrying the versions it was made with.
create table public.scores (
  application_id uuid primary key references public.applications (id) on delete cascade,
  total numeric(4, 1) check (total between 0 and 100),
  band text check (band in ('strong', 'possible', 'weak')),
  breakdown jsonb not null,
  scoring_version text not null,
  requirements_version integer not null,
  created_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index notes_application_id_idx on public.notes (application_id);

create table public.stage_events (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.applications (id) on delete cascade,
  from_stage public.application_stage not null,
  to_stage public.application_stage not null,
  actor_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index stage_events_application_id_idx on public.stage_events (application_id);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();
create trigger applications_touch before update on public.applications
  for each row execute function public.touch_updated_at();

-- Everyone who signs up is a candidate. HR accounts are promoted by an operator, never
-- by anything a signup form can send.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 120));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

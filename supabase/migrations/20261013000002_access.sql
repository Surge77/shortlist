-- Who may read and change what. Row-level security is the boundary: the frontend talks to
-- Postgres directly, so hiding something in the UI is never enough. The API writes with
-- the service role, which bypasses RLS and checks roles itself.

create function public.is_hr() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'hr');
$$;

-- Supabase grants every table to anon and authenticated by default; take back the writes
-- that must go through the API or the audited functions below.
revoke all on all tables in schema public from anon;
grant select on public.jobs to anon;

revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- Requirements and weights are written only by the API, which validates them; a job is
-- always created as a draft and opened through an update the check constraint guards.
revoke insert, update on public.jobs from authenticated;
grant insert (title, department, location, employment_type, description, created_by) on public.jobs to authenticated;
grant update (title, department, location, employment_type, description, status) on public.jobs to authenticated;

-- PostgREST never issues these, but nothing in the browser should hold them either.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

revoke insert, update, delete on public.applications, public.extractions, public.scores, public.stage_events
  from authenticated;
revoke update, delete on public.notes from authenticated;

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;
alter table public.extractions enable row level security;
alter table public.scores enable row level security;
alter table public.notes enable row level security;
alter table public.stage_events enable row level security;

-- `(select ...)` lets Postgres evaluate the check once per query instead of once per row.
create policy "profiles: own or hr" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_hr()));
create policy "profiles: edit own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Separate from the signed-in policy: anon has no grant on applications, and Postgres does
-- not promise to skip the subquery below just because status = 'open' already matched.
create policy "jobs: open to visitors" on public.jobs for select to anon
  using (status = 'open');
create policy "jobs: open, applied to, or hr" on public.jobs for select to authenticated
  using (
    status = 'open'
    or (select public.is_hr())
    -- A candidate keeps seeing a job they applied to after it closes.
    or exists (
      select 1 from public.applications a
      where a.job_id = jobs.id and a.candidate_id = (select auth.uid())
    )
  );
create policy "jobs: hr creates" on public.jobs for insert to authenticated
  with check ((select public.is_hr()) and created_by = (select auth.uid()));
create policy "jobs: hr edits" on public.jobs for update to authenticated
  using ((select public.is_hr())) with check ((select public.is_hr()));
create policy "jobs: hr deletes drafts" on public.jobs for delete to authenticated
  using ((select public.is_hr()) and status = 'draft');

create policy "applications: own or hr" on public.applications for select to authenticated
  using (candidate_id = (select auth.uid()) or (select public.is_hr()));

-- No candidate policy on these: a candidate's score is unreadable, not merely unshown.
create policy "extractions: hr" on public.extractions for select to authenticated
  using ((select public.is_hr()));
create policy "scores: hr" on public.scores for select to authenticated
  using ((select public.is_hr()));
create policy "stage events: hr" on public.stage_events for select to authenticated
  using ((select public.is_hr()));
create policy "notes: hr reads" on public.notes for select to authenticated
  using ((select public.is_hr()));
create policy "notes: hr writes as self" on public.notes for insert to authenticated
  with check ((select public.is_hr()) and author_id = (select auth.uid()));

-- Stage changes go through these two functions so every one leaves an audit row.
create function public.withdraw_application(application_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  previous public.application_stage;
begin
  select stage into previous from public.applications
    where id = application_id and candidate_id = auth.uid()
    for update;
  if previous is null or previous not in ('submitted', 'reviewing') then
    raise exception 'This application can no longer be withdrawn' using errcode = 'P0001';
  end if;
  update public.applications set stage = 'withdrawn' where id = application_id;
  insert into public.stage_events (application_id, from_stage, to_stage, actor_id)
    values (application_id, previous, 'withdrawn', auth.uid());
end;
$$;

create function public.set_application_stage(application_id uuid, new_stage public.application_stage)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  previous public.application_stage;
begin
  if not public.is_hr() then
    raise exception 'Only HR can change an application''s stage' using errcode = '42501';
  end if;
  if new_stage = 'withdrawn' then
    raise exception 'Only the candidate can withdraw an application' using errcode = 'P0001';
  end if;
  select stage into previous from public.applications where id = application_id for update;
  if previous is null then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;
  if previous = 'withdrawn' then
    raise exception 'The candidate withdrew this application' using errcode = 'P0001';
  end if;
  if previous = new_stage then
    return;
  end if;
  update public.applications set stage = new_stage where id = application_id;
  insert into public.stage_events (application_id, from_stage, to_stage, actor_id)
    values (application_id, previous, new_stage, auth.uid());
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
-- Policies call is_hr() as the signed-in user, so authenticated keeps it; no anon policy uses it.
revoke execute on function public.is_hr() from public, anon;
grant execute on function public.is_hr() to authenticated;
revoke execute on function public.withdraw_application(uuid) from public, anon;
revoke execute on function public.set_application_stage(uuid, public.application_stage) from public, anon;
grant execute on function public.withdraw_application(uuid) to authenticated;
grant execute on function public.set_application_stage(uuid, public.application_stage) to authenticated;

-- Resumes live in a private bucket at resumes/<candidate id>/<application id>.<ext>.
-- Only the API writes to it (with the service role, after checking the file's type and
-- size), so there is deliberately no insert, update or delete policy for users.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes', 'resumes', false, 5242880,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png', 'image/jpeg', 'image/webp'
  ]
)
on conflict (id) do nothing;

create policy "resumes: own or hr" on storage.objects for select to authenticated
  using (
    bucket_id = 'resumes'
    and ((select public.is_hr()) or (storage.foldername(name))[1] = (select auth.uid())::text)
  );

-- Candidates watch their application move from processing to scored without polling.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.applications;
  end if;
end;
$$;

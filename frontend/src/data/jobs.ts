import { NOT_CONFIGURED, supabase } from "../lib/supabase";
import type { ApiResult } from "../types";
import type { HrJob, Job, JobFields, JobStatus } from "./types";

const JOB_COLUMNS =
  "id,title,department,location,employment_type,description,status,requirements,requirements_version,weights,created_at";
export const LOAD_FAILED = "Couldn't load this. Check your connection and try again.";
const SAVE_FAILED = "Couldn't save. Check the fields and try again.";
const NEEDS_REQUIREMENTS = "Approve the requirements before publishing the job.";

interface DbError {
  message: string;
}

export function saveError(error: DbError): string {
  return error.message.includes("open_jobs_have_requirements") ? NEEDS_REQUIREMENTS : SAVE_FAILED;
}

export async function listOpenJobs(): Promise<ApiResult<Job[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from("jobs")
    .select(JOB_COLUMNS)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  return error ? { ok: false, message: LOAD_FAILED } : { ok: true, data: data as Job[] };
}

export async function getJob(id: string): Promise<ApiResult<Job | null>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { data, error } = await supabase.from("jobs").select(JOB_COLUMNS).eq("id", id).maybeSingle();
  return error ? { ok: false, message: LOAD_FAILED } : { ok: true, data: data as Job | null };
}

export async function listHrJobs(): Promise<ApiResult<HrJob[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from("jobs")
    .select(`${JOB_COLUMNS},applications(count)`)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, message: LOAD_FAILED };
  const rows = data as (Job & { applications: { count: number }[] })[];
  return {
    ok: true,
    data: rows.map(({ applications, ...job }) => ({ ...job, applicant_count: applications[0]?.count ?? 0 })),
  };
}

export async function createJob(fields: JobFields): Promise<ApiResult<string>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { data, error } = await supabase.from("jobs").insert(fields).select("id").single();
  return error ? { ok: false, message: saveError(error) } : { ok: true, data: (data as { id: string }).id };
}

export async function updateJob(id: string, fields: Partial<JobFields> & { status?: JobStatus }): Promise<ApiResult<null>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { error } = await supabase.from("jobs").update(fields).eq("id", id);
  return error ? { ok: false, message: saveError(error) } : { ok: true, data: null };
}

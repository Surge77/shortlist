import { NOT_CONFIGURED, supabase } from "../lib/supabase";
import type { ApiResult } from "../types";
import { LOAD_FAILED } from "./jobs";
import type {
  Applicant,
  ApplicationDetail,
  Extraction,
  MyApplication,
  Note,
  Score,
  Stage,
  StageEvent,
} from "./types";

// One-to-one embeds (scores, extractions) come back as an object or a one-item array
// depending on how PostgREST reads the relationship; accept both.
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const SIGNED_URL_SECONDS = 300;
const APPLICANT_COLUMNS =
  "id,stage,processing_status,processing_error,created_at,profiles(full_name),scores(total,band,breakdown,requirements_version)";

interface RawApplicant extends Omit<Applicant, "full_name" | "score"> {
  profiles: { full_name: string | null } | null;
  scores: Score | Score[] | null;
}

function toApplicant({ profiles, scores, ...row }: RawApplicant): Applicant {
  return { ...row, full_name: profiles?.full_name ?? null, score: one(scores) };
}

export async function listMyApplications(): Promise<ApiResult<MyApplication[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from("applications")
    .select("id,stage,created_at,job:jobs(id,title,location,status)")
    .order("created_at", { ascending: false });
  return error ? { ok: false, message: LOAD_FAILED } : { ok: true, data: data as unknown as MyApplication[] };
}

export async function withdrawApplication(id: string): Promise<ApiResult<null>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { error } = await supabase.rpc("withdraw_application", { application_id: id });
  return error ? { ok: false, message: error.message } : { ok: true, data: null };
}

export async function listApplicants(jobId: string): Promise<ApiResult<Applicant[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from("applications")
    .select(APPLICANT_COLUMNS)
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, message: LOAD_FAILED };
  return { ok: true, data: (data as unknown as RawApplicant[]).map(toApplicant) };
}

interface RawDetail extends RawApplicant {
  candidate_id: string;
  resume_path: string;
  source_type: ApplicationDetail["source_type"];
  cover_note: string | null;
  jobs: ApplicationDetail["job"];
  extractions: Extraction | Extraction[] | null;
}

export async function getApplicationDetail(id: string): Promise<ApiResult<ApplicationDetail | null>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from("applications")
    .select(
      `${APPLICANT_COLUMNS},candidate_id,resume_path,source_type,cover_note,jobs(id,title,requirements_version),` +
        "extractions(record,experience_months,warnings,invalid_fields,source_text)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, message: LOAD_FAILED };
  if (!data) return { ok: true, data: null };
  const { jobs, extractions, candidate_id, resume_path, source_type, cover_note, ...applicant } =
    data as unknown as RawDetail;
  return {
    ok: true,
    data: {
      ...toApplicant(applicant),
      candidate_id,
      resume_path,
      source_type,
      cover_note,
      job: jobs,
      extraction: one(extractions),
    },
  };
}

export async function listNotes(applicationId: string): Promise<ApiResult<Note[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from("notes")
    .select("id,body,created_at,author:profiles(full_name)")
    .eq("application_id", applicationId)
    .order("created_at");
  if (error) return { ok: false, message: LOAD_FAILED };
  const rows = data as unknown as (Omit<Note, "author_name"> & { author: { full_name: string | null } | null })[];
  return { ok: true, data: rows.map(({ author, ...note }) => ({ ...note, author_name: author?.full_name ?? null })) };
}

export async function addNote(applicationId: string, body: string): Promise<ApiResult<null>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { error } = await supabase.from("notes").insert({ application_id: applicationId, body });
  return error ? { ok: false, message: "Couldn't save the note. Try again." } : { ok: true, data: null };
}

export async function listStageEvents(applicationId: string): Promise<ApiResult<StageEvent[]>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from("stage_events")
    .select("id,from_stage,to_stage,created_at")
    .eq("application_id", applicationId)
    .order("id");
  return error ? { ok: false, message: LOAD_FAILED } : { ok: true, data: data as StageEvent[] };
}

export async function setStage(applicationId: string, stage: Stage): Promise<ApiResult<null>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { error } = await supabase.rpc("set_application_stage", { application_id: applicationId, new_stage: stage });
  return error ? { ok: false, message: error.message } : { ok: true, data: null };
}

export async function resumeUrl(path: string): Promise<ApiResult<string>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { data, error } = await supabase.storage.from("resumes").createSignedUrl(path, SIGNED_URL_SECONDS);
  return error || !data ? { ok: false, message: "Couldn't open the resume file." } : { ok: true, data: data.signedUrl };
}

import { NOT_CONFIGURED, supabase } from "../lib/supabase";
import type { ApiResult } from "../types";
import { LOAD_FAILED } from "./jobs";

export const MAX_NAME_CHARS = 120;

export interface MyProfile {
  full_name: string | null;
  resume_path: string | null;
  resume_filename: string | null;
  resume_updated_at: string | null;
}

export async function getMyProfile(userId: string): Promise<ApiResult<MyProfile | null>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name,resume_path,resume_filename,resume_updated_at")
    .eq("id", userId)
    .maybeSingle();
  return error ? { ok: false, message: LOAD_FAILED } : { ok: true, data: data as MyProfile | null };
}

// The only profile column a browser may write; the saved resume goes through the API.
export async function renameMe(userId: string, fullName: string): Promise<ApiResult<null>> {
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId);
  return error ? { ok: false, message: "Couldn't save your name. Try again." } : { ok: true, data: null };
}

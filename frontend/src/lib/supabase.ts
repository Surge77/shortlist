import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The anon key is public by design: row-level security in the database decides what each
// signed-in user can read and write. The service role key never comes near the browser.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

export const NOT_CONFIGURED =
  "Shortlist isn't connected to Supabase. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.";

export async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  // getSession refreshes an expired token first, so the API always gets a live one.
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

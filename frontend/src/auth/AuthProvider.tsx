import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { Role } from "../data/types";
import { NOT_CONFIGURED, supabase } from "../lib/supabase";

export type AuthState =
  | { status: "unconfigured" }
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; userId: string; email: string; role: Role; fullName: string | null };

export type AuthResult = { ok: true } | { ok: false; message: string };

interface AuthContextValue {
  auth: AuthState;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, fullName: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SIGN_IN_FAILED = "That email and password don't match an account.";
const NO_PROFILE = "Your account has no profile yet. Try again in a moment.";

async function loadProfile(userId: string, email: string): Promise<AuthState> {
  if (!supabase) return { status: "unconfigured" };
  const { data, error } = await supabase.from("profiles").select("role, full_name").eq("id", userId).maybeSingle();
  if (error || !data) return { status: "signedOut" };
  return { status: "signedIn", userId, email, role: data.role as Role, fullName: data.full_name as string | null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(supabase ? { status: "loading" } : { status: "unconfigured" });

  useEffect(() => {
    if (!supabase) return;
    let isActive = true;
    // Fires once on load with the stored session, then on every sign-in, sign-out and refresh.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        if (isActive) setAuth({ status: "signedOut" });
        return;
      }
      // Deferred: Supabase warns against awaiting its own calls inside this callback.
      setTimeout(() => {
        void loadProfile(session.user.id, session.user.email ?? "").then((next) => {
          if (isActive) setAuth(next);
        });
      }, 0);
    });
    return () => {
      isActive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: NOT_CONFIGURED };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return { ok: false, message: SIGN_IN_FAILED };
    const next = await loadProfile(data.user.id, data.user.email ?? email);
    if (next.status !== "signedIn") return { ok: false, message: NO_PROFILE };
    setAuth(next);
    return { ok: true };
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: NOT_CONFIGURED };
    // The name travels as user metadata; a database trigger copies it into the profile.
    // Nothing here can choose a role: every signup is a candidate.
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setAuth({ status: "signedOut" });
  }, []);

  const value = useMemo(() => ({ auth, signIn, signUp, signOut }), [auth, signIn, signUp, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}

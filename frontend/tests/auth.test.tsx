import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase } from "./fakeSupabase";

type AuthCallback = (event: string, session: { user: { id: string; email: string } } | null) => void;

const state = vi.hoisted(() => ({
  db: null as ReturnType<typeof fakeSupabase> | null,
  callback: null as AuthCallback | null,
  auth: {
    onAuthStateChange: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
  },
}));

vi.mock("../src/lib/supabase", () => ({
  get supabase() {
    return state.db ? { ...state.db.client, auth: state.auth } : null;
  },
  NOT_CONFIGURED: "not configured",
  accessToken: async () => null,
}));

const { AuthProvider, useAuth } = await import("../src/auth/AuthProvider");

function Probe() {
  const { auth } = useAuth();
  return <p data-testid="auth">{auth.status === "signedIn" ? `${auth.role}:${auth.fullName}` : auth.status}</p>;
}

const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  state.db = fakeSupabase();
  state.auth.onAuthStateChange.mockImplementation((callback: AuthCallback) => {
    state.callback = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("AuthProvider", () => {
  it("loads the stored session's profile and role", async () => {
    state.db?.reply("profiles", { data: { role: "hr", full_name: "Hana" } });
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByTestId("auth")).toHaveTextContent("loading");

    act(() => state.callback?.("INITIAL_SESSION", { user: { id: "u1", email: "hana@example.com" } }));

    await waitFor(() => expect(screen.getByTestId("auth")).toHaveTextContent("hr:Hana"));
  });

  it("is signed out when there is no session", async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    act(() => state.callback?.("INITIAL_SESSION", null));
    expect(screen.getByTestId("auth")).toHaveTextContent("signedOut");
  });

  it("signs in with a password and refuses a wrong one", async () => {
    state.auth.signInWithPassword.mockResolvedValueOnce({ data: { user: { id: "u1", email: "c@example.com" } }, error: null });
    state.db?.reply("profiles", { data: { role: "candidate", full_name: "Riya" } });
    state.auth.signInWithPassword.mockResolvedValueOnce({ data: { user: null }, error: { message: "Invalid login" } });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => expect(await result.current.signIn("c@example.com", "pw")).toEqual({ ok: true }));
    expect(result.current.auth).toMatchObject({ status: "signedIn", role: "candidate" });
    await act(async () => expect((await result.current.signIn("c@example.com", "bad")).ok).toBe(false));
  });

  it("signs up with the name as metadata, never a role, and signs out", async () => {
    state.auth.signUp.mockResolvedValue({ error: null });
    state.auth.signOut.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => expect(await result.current.signUp("n@example.com", "password1", "New Person")).toEqual({ ok: true }));
    expect(state.auth.signUp).toHaveBeenCalledWith({
      email: "n@example.com", password: "password1", options: { data: { full_name: "New Person" } },
    });

    await act(() => result.current.signOut());
    expect(result.current.auth.status).toBe("signedOut");
  });

  it("reports when Supabase is not configured", async () => {
    state.db = null;
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.auth.status).toBe("unconfigured");
    await act(async () => expect(await result.current.signIn("a@example.com", "pw")).toEqual({ ok: false, message: "not configured" }));
  });

  it("must be used inside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderHook(() => useAuth())).toThrow(/inside <AuthProvider>/);
  });
});

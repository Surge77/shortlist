import type { JobRequirements, Weights } from "./data/types";
import { accessToken } from "./lib/supabase";
import type { ApiResult, ExtractResponse, ResumeInput } from "./types";

// The backend gives Gemini 60 s to read a file; leave headroom for the upload.
const REQUEST_TIMEOUT_MS = 90_000;
// Same origin by default (Vite proxies /api in development); set when the API is hosted elsewhere.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

export const NETWORK_ERROR = "Can't reach the Shortlist server. Check that the backend is running, then try again.";
export const TIMEOUT_ERROR = "Reading the resume took too long. Try again, or paste the text instead.";
export const UNEXPECTED_REPLY = "The server sent an answer Shortlist could not read. Try again.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function errorMessage(status: number, payload: unknown): string {
  const detail = isRecord(payload) ? payload.detail : undefined;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && isRecord(detail[0]) && typeof detail[0].msg === "string") {
    return `${detail[0].msg}.`;
  }
  return `The server had a problem (${status}). Try again.`;
}

// `isExpected` guards against a proxy or crashed server answering 200 with HTML, or JSON
// of the wrong shape, which would otherwise crash whatever reads it.
async function request<T>(
  path: string,
  init: { method: string; body?: BodyInit; json?: unknown },
  isExpected: (payload: unknown) => boolean,
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  const token = await accessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body = init.body;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }

  try {
    // No Content-Type for FormData: the browser sets the multipart boundary itself.
    const response = await fetch(`${API_BASE}${path}`, {
      method: init.method,
      headers,
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, message: errorMessage(response.status, payload) };
    if (!isExpected(payload)) return { ok: false, message: UNEXPECTED_REPLY };
    return { ok: true, data: payload as T };
  } catch (error: unknown) {
    const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
    return { ok: false, message: isTimeout ? TIMEOUT_ERROR : NETWORK_ERROR };
  }
}

export async function extractResume(input: ResumeInput): Promise<ApiResult<ExtractResponse>> {
  const form = new FormData();
  if (input.kind === "file") form.append("file", input.file);
  else form.append("text", input.text);
  return request("/api/extract", { method: "POST", body: form }, (p) => isRecord(p) && isRecord(p.candidate));
}

export async function applyToJob(jobId: string, file: File, coverNote: string): Promise<ApiResult<{ id: string }>> {
  const form = new FormData();
  form.append("file", file);
  if (coverNote.trim()) form.append("cover_note", coverNote.trim());
  return request(`/api/jobs/${encodeURIComponent(jobId)}/applications`, { method: "POST", body: form },
    (p) => isRecord(p) && typeof p.id === "string");
}

export async function draftRequirements(description: string): Promise<ApiResult<JobRequirements>> {
  return request("/api/requirements/draft", { method: "POST", json: { description } },
    (p) => isRecord(p) && Array.isArray(p.must_have));
}

export async function saveRequirements(
  jobId: string,
  requirements: JobRequirements,
  weights: Weights,
): Promise<ApiResult<{ requirements_version: number }>> {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/requirements`, { method: "PUT", json: { requirements, weights } },
    (p) => isRecord(p) && typeof p.requirements_version === "number");
}

export async function rescoreApplication(applicationId: string): Promise<ApiResult<{ queued: number }>> {
  return request(`/api/applications/${encodeURIComponent(applicationId)}/rescore`, { method: "POST" },
    (p) => isRecord(p) && typeof p.queued === "number");
}

export async function rescoreJob(jobId: string): Promise<ApiResult<{ queued: number }>> {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/rescore`, { method: "POST" },
    (p) => isRecord(p) && typeof p.queued === "number");
}

export interface AuthOptions {
  demo: boolean;
  hr_email: string | null;
  candidate_email: string | null;
}

export async function getAuthOptions(): Promise<ApiResult<AuthOptions>> {
  return request("/api/auth/options", { method: "GET" }, (p) => isRecord(p) && typeof p.demo === "boolean");
}

export async function demoSignIn(email: string): Promise<ApiResult<{ token_hash: string }>> {
  return request("/api/auth/demo-login", { method: "POST", json: { email } },
    (p) => isRecord(p) && typeof p.token_hash === "string");
}

export interface ResetResult {
  deleted_applications: number;
  deleted_jobs: number;
  deleted_accounts: number;
  rescoring: number;
}

export async function resetDemo(): Promise<ApiResult<ResetResult>> {
  return request("/api/demo/reset", { method: "POST" }, (p) => isRecord(p) && typeof p.deleted_jobs === "number");
}

export interface SavedResumeInfo {
  filename: string;
  source_type: string;
}

export async function saveResume(file: File): Promise<ApiResult<SavedResumeInfo>> {
  const form = new FormData();
  form.append("file", file);
  return request("/api/me/resume", { method: "PUT", body: form }, (p) => isRecord(p) && typeof p.filename === "string");
}

export async function removeSavedResume(): Promise<ApiResult<null>> {
  return request("/api/me/resume", { method: "DELETE" }, () => true);
}

export async function quickApply(jobId: string, coverNote: string): Promise<ApiResult<{ id: string }>> {
  const form = new FormData();
  form.append("use_saved_resume", "true");
  if (coverNote.trim()) form.append("cover_note", coverNote.trim());
  return request(`/api/jobs/${encodeURIComponent(jobId)}/applications`, { method: "POST", body: form },
    (p) => isRecord(p) && typeof p.id === "string");
}

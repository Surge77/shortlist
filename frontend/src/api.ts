import type { ApiResult, ExtractResponse, ResumeInput } from "./types";

// The backend gives Gemini 60 s to read a file; leave headroom for the upload.
const REQUEST_TIMEOUT_MS = 90_000;

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

export async function extractResume(input: ResumeInput): Promise<ApiResult<ExtractResponse>> {
  const form = new FormData();
  if (input.kind === "file") form.append("file", input.file);
  else form.append("text", input.text);

  try {
    // No Content-Type header: the browser sets the multipart boundary itself.
    const response = await fetch("/api/extract", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, message: errorMessage(response.status, payload) };
    // A proxy or crashed server can answer 200 with HTML; never hand that on as data.
    // Also catches JSON of the wrong shape, which would otherwise crash the reducer.
    if (!isRecord(payload) || !isRecord(payload.candidate)) return { ok: false, message: UNEXPECTED_REPLY };
    return { ok: true, data: payload as unknown as ExtractResponse };
  } catch (error: unknown) {
    const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
    return { ok: false, message: isTimeout ? TIMEOUT_ERROR : NETWORK_ERROR };
  }
}

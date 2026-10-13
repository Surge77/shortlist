// Same limits as backend/app/documents.py, checked here so a wrong file is refused
// before it is uploaded. The server still sniffs the bytes; this check is a courtesy.

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_CHARS = 30_000;
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".png", ".jpg", ".jpeg", ".webp"];
export const ACCEPT = ALLOWED_EXTENSIONS.join(",");

export type PreviewKind = "pdf" | "image" | "docx";

export function previewKind(file: File): PreviewKind {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  return "image";
}

export function checkFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    return "Upload a PDF, Word (.docx), PNG, JPG or WebP file.";
  }
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_FILE_BYTES) return "Files are limited to 5 MB.";
  return null;
}

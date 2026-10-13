// Mirrors backend/app/schemas.py. Keep the two in step when either changes.

export type SourceType = "text" | "pdf" | "docx" | "image";
export type CheckedField = "email" | "phone";

export interface Contact {
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin: string | null;
  github: string | null;
  portfolio: string | null;
}

export interface Skills {
  technical: string[];
  tools: string[];
  soft: string[];
}

export interface Experience {
  company: string | null;
  role: string | null;
  start: string | null;
  end: string | null;
  location: string | null;
  highlights: string[];
}

export interface Education {
  institution: string | null;
  degree: string | null;
  field: string | null;
  start: string | null;
  end: string | null;
  grade: string | null;
}

export interface Project {
  name: string;
  description: string | null;
  tech: string[];
}

export interface Certification {
  name: string;
  issuer: string | null;
  year: string | null;
}

export interface Candidate {
  is_resume: boolean;
  full_name: string | null;
  headline: string | null;
  contact: Contact;
  summary: string | null;
  skills: Skills;
  experience: Experience[];
  education: Education[];
  projects: Project[];
  certifications: Certification[];
  achievements: string[];
  languages: string[];
}

export interface ExtractResponse {
  candidate: Candidate;
  experience_months: number | null;
  warnings: string[];
  invalid_fields: CheckedField[];
  source_type: SourceType;
  source_text: string | null;
}

export type ResumeInput = { kind: "file"; file: File } | { kind: "text"; text: string };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string };

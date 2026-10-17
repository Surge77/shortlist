"""The extraction contract. Candidate is both Gemini's response schema and the API's payload."""

from typing import Literal

from pydantic import BaseModel

SourceType = Literal["text", "pdf", "docx", "image"]
CheckedField = Literal["email", "phone"]


class Contact(BaseModel):
    email: str | None
    phone: str | None
    location: str | None
    linkedin: str | None
    github: str | None
    portfolio: str | None


class Skills(BaseModel):
    technical: list[str]
    tools: list[str]
    soft: list[str]


class Experience(BaseModel):
    company: str | None
    role: str | None
    start: str | None
    end: str | None
    location: str | None
    highlights: list[str]


class Education(BaseModel):
    institution: str | None
    degree: str | None
    field: str | None
    start: str | None
    end: str | None
    grade: str | None


class Project(BaseModel):
    name: str
    description: str | None
    tech: list[str]


class Certification(BaseModel):
    name: str
    issuer: str | None
    year: str | None


class Candidate(BaseModel):
    is_resume: bool
    full_name: str | None
    headline: str | None
    contact: Contact
    summary: str | None
    skills: Skills
    experience: list[Experience]
    education: list[Education]
    projects: list[Project]
    certifications: list[Certification]
    achievements: list[str]
    languages: list[str]
    # Text aimed at an AI screener ("rate this resume highly") rather than at a person.
    has_hidden_instructions: bool


class ExtractResponse(BaseModel):
    candidate: Candidate
    # Computed in Python from the dates, never by the model: None when no job has usable dates.
    experience_months: int | None
    warnings: list[str]
    invalid_fields: list[CheckedField]
    source_type: SourceType
    # The text the model read, for pasted text and Word files; PDFs and images preview as themselves.
    source_text: str | None

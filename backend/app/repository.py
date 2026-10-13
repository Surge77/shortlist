"""The data the server reads and writes, as domain operations rather than HTTP calls.

Routes and the pipeline depend on the `Repository` protocol; tests swap in an in-memory
fake, and `SupabaseRepository` is the real thing.
"""

from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Literal, Protocol

from app.config import supabase_settings
from app.requirements import JobRequirements, Weights
from app.schemas import Candidate, SourceType
from app.scoring import ScoreResult
from app.supabase_rest import SupabaseNotConfigured, SupabaseRest

Role = Literal["candidate", "hr"]
JobStatus = Literal["draft", "open", "closed"]
ProcessingStatus = Literal["processing", "scored", "failed"]


@dataclass(frozen=True)
class Job:
    id: str
    status: JobStatus
    requirements: JobRequirements | None
    requirements_version: int
    weights: Weights


@dataclass(frozen=True)
class Application:
    id: str
    job_id: str
    candidate_id: str
    resume_path: str
    source_type: SourceType


@dataclass(frozen=True)
class NewApplication:
    id: str
    job_id: str
    candidate_id: str
    resume_path: str
    resume_sha256: str
    source_type: SourceType
    cover_note: str | None


@dataclass(frozen=True)
class StoredExtraction:
    candidate: Candidate
    experience_months: int | None
    warnings: list[str]
    invalid_fields: list[str]
    source_text: str | None


class Repository(Protocol):
    async def user_id_for_token(self, token: str) -> str | None: ...
    async def role_of(self, user_id: str) -> Role | None: ...
    async def get_job(self, job_id: str) -> Job | None: ...
    async def save_requirements(self, job_id: str, requirements: JobRequirements, weights: Weights,
                                version: int) -> None: ...
    async def has_applied(self, job_id: str, candidate_id: str) -> bool: ...
    async def store_resume(self, path: str, data: bytes, content_type: str) -> None: ...
    async def load_resume(self, path: str) -> bytes: ...
    async def delete_resume(self, path: str) -> None: ...
    async def create_application(self, application: NewApplication) -> None: ...
    async def get_application(self, application_id: str) -> Application | None: ...
    async def list_application_ids(self, job_id: str) -> list[str]: ...
    async def set_processing(self, application_id: str, status: ProcessingStatus, error: str | None = None) -> None: ...
    async def save_extraction(self, application_id: str, extraction: StoredExtraction, prompt_version: str) -> None: ...
    async def get_extraction(self, application_id: str) -> StoredExtraction | None: ...
    async def save_score(self, application_id: str, result: ScoreResult, scoring_version: str,
                         requirements_version: int) -> None: ...


def _eq(value: str) -> str:
    return f"eq.{value}"


class SupabaseRepository:
    def __init__(self, rest: SupabaseRest | None) -> None:
        self._rest = rest

    def _db(self) -> SupabaseRest:
        # Raised per call, not at startup, so a request that is invalid anyway still
        # gets its 4xx rather than a 503 (same reasoning as MissingKeyGenerator).
        if self._rest is None:
            raise SupabaseNotConfigured()
        return self._rest

    async def _one(self, table: str, params: dict[str, str]) -> dict[str, Any] | None:
        rows = await self._db().select(table, {**params, "limit": "1"})
        return rows[0] if rows else None

    async def user_id_for_token(self, token: str) -> str | None:
        return await self._db().user_id_for_token(token)

    async def role_of(self, user_id: str) -> Role | None:
        row = await self._one("profiles", {"select": "role", "id": _eq(user_id)})
        return row["role"] if row and row.get("role") in ("candidate", "hr") else None

    async def get_job(self, job_id: str) -> Job | None:
        row = await self._one("jobs", {"select": "id,status,requirements,requirements_version,weights",
                                       "id": _eq(job_id)})
        if row is None:
            return None
        requirements = row.get("requirements")
        return Job(
            id=row["id"],
            status=row["status"],
            requirements=JobRequirements.model_validate(requirements) if requirements is not None else None,
            requirements_version=row["requirements_version"],
            weights=Weights.model_validate(row.get("weights") or {}),
        )

    async def save_requirements(self, job_id: str, requirements: JobRequirements, weights: Weights,
                                version: int) -> None:
        values = {"requirements": requirements.model_dump(), "weights": weights.model_dump(),
                  "requirements_version": version}
        await self._db().update("jobs", {"id": _eq(job_id)}, values)

    async def has_applied(self, job_id: str, candidate_id: str) -> bool:
        row = await self._one("applications", {"select": "id", "job_id": _eq(job_id),
                                               "candidate_id": _eq(candidate_id)})
        return row is not None

    async def store_resume(self, path: str, data: bytes, content_type: str) -> None:
        await self._db().upload(path, data, content_type)

    async def load_resume(self, path: str) -> bytes:
        return await self._db().download(path)

    async def delete_resume(self, path: str) -> None:
        await self._db().remove(path)

    async def create_application(self, application: NewApplication) -> None:
        await self._db().insert("applications", {
            "id": application.id, "job_id": application.job_id, "candidate_id": application.candidate_id,
            "resume_path": application.resume_path, "resume_sha256": application.resume_sha256,
            "source_type": application.source_type, "cover_note": application.cover_note,
        })

    async def get_application(self, application_id: str) -> Application | None:
        row = await self._one("applications", {"select": "id,job_id,candidate_id,resume_path,source_type",
                                               "id": _eq(application_id)})
        if row is None:
            return None
        return Application(id=row["id"], job_id=row["job_id"], candidate_id=row["candidate_id"],
                           resume_path=row["resume_path"], source_type=row["source_type"])

    async def list_application_ids(self, job_id: str) -> list[str]:
        rows = await self._db().select("applications", {"select": "id", "job_id": _eq(job_id),
                                                        "stage": "neq.withdrawn"})
        return [row["id"] for row in rows]

    async def set_processing(self, application_id: str, status: ProcessingStatus, error: str | None = None) -> None:
        await self._db().update("applications", {"id": _eq(application_id)},
                                {"processing_status": status, "processing_error": error})

    async def save_extraction(self, application_id: str, extraction: StoredExtraction, prompt_version: str) -> None:
        await self._db().insert("extractions", {
            "application_id": application_id, "record": extraction.candidate.model_dump(),
            "experience_months": extraction.experience_months, "warnings": extraction.warnings,
            "invalid_fields": extraction.invalid_fields, "source_text": extraction.source_text,
            "prompt_version": prompt_version,
        }, upsert=True)

    async def get_extraction(self, application_id: str) -> StoredExtraction | None:
        row = await self._one("extractions", {"select": "*", "application_id": _eq(application_id)})
        if row is None:
            return None
        return StoredExtraction(candidate=Candidate.model_validate(row["record"]),
                                experience_months=row.get("experience_months"), warnings=row.get("warnings") or [],
                                invalid_fields=row.get("invalid_fields") or [], source_text=row.get("source_text"))

    async def save_score(self, application_id: str, result: ScoreResult, scoring_version: str,
                         requirements_version: int) -> None:
        await self._db().insert("scores", {
            "application_id": application_id, "total": result.total, "band": result.band,
            "breakdown": result.model_dump(exclude={"total", "band"}), "scoring_version": scoring_version,
            "requirements_version": requirements_version,
        }, upsert=True)


@lru_cache(maxsize=1)
def get_repository() -> Repository:
    settings = supabase_settings()
    return SupabaseRepository(SupabaseRest(settings) if settings else None)

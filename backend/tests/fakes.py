"""An in-memory Repository, so API and pipeline tests run without Supabase."""

from dataclasses import dataclass, field, replace

from app.repository import (Application, Job, NewApplication, ProcessingStatus, Role, SavedResume,
                            StoredExtraction)
from app.requirements import JobRequirements, Weights
from app.scoring import ScoreResult
from app.supabase_rest import DuplicateRow

HR_ID = "00000000-0000-4000-8000-000000000001"
ALICE_ID = "00000000-0000-4000-8000-000000000002"
BOB_ID = "00000000-0000-4000-8000-000000000003"
OPEN_JOB_ID = "10000000-0000-4000-8000-000000000001"
DRAFT_JOB_ID = "10000000-0000-4000-8000-000000000002"

HR_TOKEN = "hr-token"
ALICE_TOKEN = "alice-token"
BOB_TOKEN = "bob-token"


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@dataclass
class SavedScore:
    result: ScoreResult
    scoring_version: str
    requirements_version: int


@dataclass
class FakeRepository:
    tokens: dict[str, str] = field(default_factory=lambda: {HR_TOKEN: HR_ID, ALICE_TOKEN: ALICE_ID, BOB_TOKEN: BOB_ID})
    roles: dict[str, Role] = field(default_factory=lambda: {HR_ID: "hr", ALICE_ID: "candidate", BOB_ID: "candidate"})
    jobs: dict[str, Job] = field(default_factory=dict)
    files: dict[str, tuple[bytes, str]] = field(default_factory=dict)
    applications: dict[str, NewApplication] = field(default_factory=dict)
    processing: dict[str, tuple[ProcessingStatus, str | None]] = field(default_factory=dict)
    extractions: dict[str, StoredExtraction] = field(default_factory=dict)
    scores: dict[str, SavedScore] = field(default_factory=dict)
    saved_resumes: dict[str, SavedResume] = field(default_factory=dict)
    fail_inserts_as_duplicate: bool = False

    def add_job(self, job_id: str, *, status: str = "open", requirements: JobRequirements | None = None,
                weights: Weights | None = None, version: int = 1) -> Job:
        job = Job(id=job_id, status=status,  # pyright: ignore[reportArgumentType]
                  requirements=requirements, requirements_version=version, weights=weights or Weights())
        self.jobs[job_id] = job
        return job

    async def user_id_for_token(self, token: str) -> str | None:
        return self.tokens.get(token)

    async def role_of(self, user_id: str) -> Role | None:
        return self.roles.get(user_id)

    async def get_job(self, job_id: str) -> Job | None:
        return self.jobs.get(job_id)

    async def save_requirements(self, job_id: str, requirements: JobRequirements, weights: Weights,
                                version: int) -> None:
        self.jobs[job_id] = replace(self.jobs[job_id], requirements=requirements, weights=weights,
                                    requirements_version=version)

    async def has_applied(self, job_id: str, candidate_id: str) -> bool:
        return any(a.job_id == job_id and a.candidate_id == candidate_id for a in self.applications.values())

    async def store_resume(self, path: str, data: bytes, content_type: str) -> None:
        self.files[path] = (data, content_type)

    async def load_resume(self, path: str) -> bytes:
        return self.files[path][0]

    async def delete_resume(self, path: str) -> None:
        self.files.pop(path, None)

    async def get_saved_resume(self, user_id: str) -> SavedResume | None:
        return self.saved_resumes.get(user_id)

    async def set_saved_resume(self, user_id: str, resume: SavedResume | None) -> None:
        if resume is None:
            self.saved_resumes.pop(user_id, None)
        else:
            self.saved_resumes[user_id] = resume

    async def create_application(self, application: NewApplication) -> None:
        if self.fail_inserts_as_duplicate:
            raise DuplicateRow()
        self.applications[application.id] = application
        self.processing[application.id] = ("processing", None)

    async def get_application(self, application_id: str) -> Application | None:
        new = self.applications.get(application_id)
        if new is None:
            return None
        return Application(id=new.id, job_id=new.job_id, candidate_id=new.candidate_id,
                           resume_path=new.resume_path, source_type=new.source_type)

    async def list_application_ids(self, job_id: str) -> list[str]:
        return [a.id for a in self.applications.values() if a.job_id == job_id]

    async def set_processing(self, application_id: str, status: ProcessingStatus, error: str | None = None) -> None:
        self.processing[application_id] = (status, error)

    async def save_extraction(self, application_id: str, extraction: StoredExtraction, prompt_version: str) -> None:
        self.extractions[application_id] = extraction

    async def get_extraction(self, application_id: str) -> StoredExtraction | None:
        return self.extractions.get(application_id)

    async def save_score(self, application_id: str, result: ScoreResult, scoring_version: str,
                         requirements_version: int) -> None:
        self.scores[application_id] = SavedScore(result, scoring_version, requirements_version)

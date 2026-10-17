"""The fictional demo data in fixtures.json, typed and checked, with fixed ids.

Ids come from uuid5 over each record's slugs, so seeding or resetting twice touches the
same rows instead of adding copies.
"""

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal, get_args
from uuid import UUID, uuid5

from app.requirements import JobRequirements

DEMO_DIR = Path(__file__).resolve().parent
FIXTURES_FILE = DEMO_DIR / "fixtures.json"
RESUME_DIR = DEMO_DIR / "resumes"
NAMESPACE = UUID("6f1d3c2a-8b4e-4f7a-9c1d-2e5b7a9c0d13")
# Seeded jobs are approved once; their scores carry this version.
SEEDED_REQUIREMENTS_VERSION = 1

Stage = Literal["submitted", "reviewing", "shortlisted", "rejected", "hired", "withdrawn"]
STAGES: frozenset[str] = frozenset(get_args(Stage))


def demo_id(kind: str, *slugs: str) -> str:
    return str(uuid5(NAMESPACE, ":".join((kind, *slugs))))


@dataclass(frozen=True)
class DemoJob:
    id: str
    slug: str
    title: str
    department: str
    location: str
    employment_type: str
    description: str
    status: Literal["draft", "open"]
    requirements: JobRequirements | None
    days_ago: int

    @property
    def requirements_version(self) -> int:
        return SEEDED_REQUIREMENTS_VERSION if self.requirements else 0


@dataclass(frozen=True)
class DemoCandidate:
    slug: str
    email: str
    full_name: str
    has_saved_resume: bool

    @property
    def resume_file(self) -> Path:
        return RESUME_DIR / f"{self.slug}.pdf"


@dataclass(frozen=True)
class DemoApplication:
    id: str
    candidate: str
    job: str
    days_ago: int
    # The moves after "submitted", in order; empty means still submitted.
    stages: tuple[Stage, ...]
    cover_note: str | None
    notes: tuple[str, ...]

    @property
    def stage(self) -> Stage:
        return self.stages[-1] if self.stages else "submitted"


@dataclass(frozen=True)
class DemoData:
    hr_email: str
    hr_name: str
    jobs: tuple[DemoJob, ...]
    candidates: tuple[DemoCandidate, ...]
    applications: tuple[DemoApplication, ...]

    def candidate(self, slug: str) -> DemoCandidate:
        return next(c for c in self.candidates if c.slug == slug)

    def job(self, slug: str) -> DemoJob:
        return next(j for j in self.jobs if j.slug == slug)


def _job(raw: dict[str, Any]) -> DemoJob:
    requirements = raw.get("requirements")
    return DemoJob(
        id=demo_id("job", raw["slug"]), slug=raw["slug"], title=raw["title"], department=raw["department"],
        location=raw["location"], employment_type=raw["employment_type"], description=raw["description"],
        status=raw.get("status", "open"), days_ago=raw["days_ago"],
        requirements=JobRequirements.model_validate(requirements) if requirements else None,
    )


def _application(raw: dict[str, Any]) -> DemoApplication:
    return DemoApplication(
        id=demo_id("application", raw["candidate"], raw["job"]), candidate=raw["candidate"], job=raw["job"],
        days_ago=raw["days_ago"], stages=tuple(raw["stages"]), cover_note=raw.get("cover_note"),
        notes=tuple(raw.get("notes", [])),
    )


def check(data: DemoData) -> None:
    """Raises ValueError on any fixture mistake the database would only half-catch."""
    jobs = {job.slug: job for job in data.jobs}
    candidates = {candidate.slug: candidate for candidate in data.candidates}
    if len(jobs) != len(data.jobs) or len(candidates) != len(data.candidates):
        raise ValueError("Duplicate job or candidate slug")
    for job in data.jobs:
        if (job.status == "open") != (job.requirements is not None):
            raise ValueError(f"{job.slug}: open jobs need requirements and drafts must have none")
    for candidate in data.candidates:
        if not candidate.resume_file.is_file():
            raise ValueError(f"{candidate.slug}: missing {candidate.resume_file.name}")
    pairs = [(a.candidate, a.job) for a in data.applications]
    if len(set(pairs)) != len(pairs):
        raise ValueError("A candidate applies to the same job twice")
    for application in data.applications:
        if application.candidate not in candidates or application.job not in jobs:
            raise ValueError(f"{application.id}: unknown candidate or job")
        if jobs[application.job].status != "open":
            raise ValueError(f"{application.job}: applications only go to open jobs")
        stages = application.stages
        if not set(stages) <= STAGES - {"submitted"} or ("withdrawn" in stages and stages != ("withdrawn",)):
            raise ValueError(f"{application.candidate}/{application.job}: invalid stage history {stages}")


@lru_cache(maxsize=1)
def load_fixtures() -> DemoData:
    raw = json.loads(FIXTURES_FILE.read_text(encoding="utf-8"))
    data = DemoData(
        hr_email=raw["hr"]["email"], hr_name=raw["hr"]["full_name"],
        jobs=tuple(_job(job) for job in raw["jobs"]),
        candidates=tuple(DemoCandidate(slug=c["slug"], email=c["email"], full_name=c["full_name"],
                                       has_saved_resume=c.get("saved_resume", False)) for c in raw["candidates"]),
        applications=tuple(_application(application) for application in raw["applications"]),
    )
    check(data)
    return data

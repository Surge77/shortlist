import asyncio
from dataclasses import dataclass, field
from datetime import UTC, datetime

import pytest

from app.config import DemoSettings
from app.demo.fixtures import load_fixtures
from app.demo.reset import SAVED_RESUME_NAME, application_path, restore
from app.demo.store import Row, StoredApplication
from app.main import app
from app.repository import SavedResume
from app.routes.demo import get_demo_settings, get_demo_store
from app.supabase_rest import AuthUser
from tests.fakes import ALICE_TOKEN, auth

NOW = datetime(2026, 10, 16, 12, tzinfo=UTC)
DATA = load_fixtures()
HR_EMAILS = frozenset({DATA.hr_email})


@dataclass
class FakeDemoStore:
    users: dict[str, str] = field(default_factory=dict)  # email -> id
    profiles: dict[str, Row] = field(default_factory=dict)
    applications: dict[str, Row] = field(default_factory=dict)
    jobs: dict[str, Row] = field(default_factory=dict)
    events: list[Row] = field(default_factory=list)
    notes: list[Row] = field(default_factory=list)
    files: dict[str, bytes] = field(default_factory=dict)
    saved: dict[str, SavedResume] = field(default_factory=dict)
    scored: dict[str, int] = field(default_factory=dict)
    uploads: list[str] = field(default_factory=list)

    async def create_account(self, email: str, full_name: str) -> None:
        self.users.setdefault(email, f"user-{email}")

    async def list_users(self) -> list[AuthUser]:
        return [AuthUser(id=user_id, email=email) for email, user_id in self.users.items()]

    async def delete_account(self, user_id: str) -> None:
        self.users = {e: i for e, i in self.users.items() if i != user_id}

    async def upsert_profiles(self, rows: list[Row]) -> None:
        for row in rows:
            self.profiles[row["id"]] = {**self.profiles.get(row["id"], {}), **row}

    async def list_applications(self) -> list[StoredApplication]:
        return [StoredApplication(id=i, resume_path=row["resume_path"]) for i, row in self.applications.items()]

    async def delete_applications(self, ids: list[str]) -> None:
        for application_id in ids:
            del self.applications[application_id]

    async def list_job_ids(self) -> list[str]:
        return list(self.jobs)

    async def delete_jobs(self, ids: list[str]) -> None:
        for job_id in ids:
            del self.jobs[job_id]

    async def upsert_jobs(self, rows: list[Row]) -> None:
        self.jobs.update({row["id"]: row for row in rows})

    async def upsert_applications(self, rows: list[Row]) -> None:
        for row in rows:
            self.applications[row["id"]] = {**self.applications.get(row["id"], {}), **row}

    async def replace_history(self, application_ids: list[str], events: list[Row], notes: list[Row]) -> None:
        ids = set(application_ids)
        self.events = [e for e in self.events if e["application_id"] not in ids] + events
        self.notes = [n for n in self.notes if n["application_id"] not in ids] + notes

    async def saved_resume_paths(self, user_ids: list[str]) -> dict[str, str]:
        return {i: self.saved[i].path for i in user_ids if i in self.saved}

    async def set_saved_resume(self, user_id: str, resume: SavedResume | None) -> None:
        if resume is None:
            self.saved.pop(user_id, None)
        else:
            self.saved[user_id] = resume

    async def upload_pdf(self, path: str, data: bytes) -> None:
        self.files[path] = data
        self.uploads.append(path)

    async def remove_files(self, paths: list[str]) -> None:
        for path in paths:
            self.files.pop(path, None)

    async def needing_score(self, application_ids: list[str], requirements_version: int) -> list[str]:
        return [i for i in application_ids if self.scored.get(i) != requirements_version]


def run_restore(store, hr_emails=HR_EMAILS):
    return asyncio.run(restore(store, DATA, hr_emails, NOW))


@pytest.fixture
def seeded():
    store = FakeDemoStore()
    run_restore(store)
    store.scored = {a.id: 1 for a in DATA.applications}
    store.uploads.clear()
    return store


def riya_id(store):
    return store.users["riya.demo@example.com"]


def test_a_first_restore_creates_every_account_job_application_and_file():
    store = FakeDemoStore()

    report = run_restore(store)

    assert len(store.users) == len(DATA.candidates) + 1
    assert store.profiles[store.users[DATA.hr_email]]["role"] == "hr"
    assert len(store.jobs) == len(DATA.jobs) and len(store.applications) == len(DATA.applications)
    for application in DATA.applications:
        row = store.applications[application.id]
        assert row["resume_path"] in store.files and row["stage"] == application.stage
    assert report.needs_scoring == [a.id for a in DATA.applications]


def test_history_follows_each_stage_and_withdrawal_is_the_candidates_own_act(seeded):
    withdrawn = next(a for a in DATA.applications if a.stage == "withdrawn")
    hired = next(a for a in DATA.applications if a.stage == "hired")
    by_app = lambda app_id: [e for e in seeded.events if e["application_id"] == app_id]  # noqa: E731

    assert [(e["from_stage"], e["to_stage"]) for e in by_app(hired.id)] == [
        ("submitted", "reviewing"), ("reviewing", "shortlisted"), ("shortlisted", "hired")]
    candidate_id = seeded.users[DATA.candidate(withdrawn.candidate).email]
    assert [e["actor_id"] for e in by_app(withdrawn.id)] == [candidate_id]
    assert all(datetime.fromisoformat(e["created_at"]) < NOW for e in seeded.events)
    assert len(seeded.notes) == sum(len(a.notes) for a in DATA.applications)


def test_reset_removes_what_the_audience_added(seeded):
    seeded.users["visitor@example.com"] = "visitor"
    seeded.jobs["audience-job"] = {"id": "audience-job"}
    seeded.applications["audience-app"] = {"id": "audience-app", "resume_path": "visitor/audience-app.pdf"}
    seeded.files["visitor/audience-app.pdf"] = b"%PDF"
    seeded.saved["visitor"] = SavedResume(path="visitor/profile-1.pdf", source_type="pdf", filename="cv.pdf")
    seeded.files["visitor/profile-1.pdf"] = b"%PDF"

    report = run_restore(seeded)

    assert (report.deleted_applications, report.deleted_jobs, report.deleted_accounts) == (1, 1, 1)
    assert "visitor@example.com" not in seeded.users
    assert not any(path.startswith("visitor/") for path in seeded.files)
    assert report.needs_scoring == []


def test_reset_restores_stages_notes_and_jobs_the_audience_changed(seeded):
    application = DATA.applications[0]
    seeded.applications[application.id]["stage"] = "rejected"
    seeded.notes.append({"application_id": application.id, "body": "audience note"})
    seeded.jobs[DATA.jobs[0].id]["status"] = "closed"

    run_restore(seeded)

    assert seeded.applications[application.id]["stage"] == application.stage
    assert "audience note" not in [n["body"] for n in seeded.notes]
    assert seeded.jobs[DATA.jobs[0].id]["status"] == "open"
    assert seeded.uploads == [f"{riya_id(seeded)}/{SAVED_RESUME_NAME}"]


def test_reset_puts_back_the_demo_candidates_saved_resume(seeded):
    user_id = riya_id(seeded)
    replaced = SavedResume(path=f"{user_id}/profile-other.pdf", source_type="image", filename="photo.png")
    seeded.saved[user_id] = replaced
    seeded.files[replaced.path] = b"png"

    run_restore(seeded)

    assert seeded.saved[user_id].path == f"{user_id}/{SAVED_RESUME_NAME}"
    assert replaced.path not in seeded.files


def test_a_candidate_without_a_seeded_resume_has_theirs_cleared(seeded):
    user_id = seeded.users["arjun.mehta@example.com"]
    seeded.saved[user_id] = SavedResume(path=f"{user_id}/profile-x.pdf", source_type="pdf", filename="cv.pdf")
    seeded.files[f"{user_id}/profile-x.pdf"] = b"%PDF"

    run_restore(seeded)

    assert user_id not in seeded.saved and f"{user_id}/profile-x.pdf" not in seeded.files


def test_extra_allowlisted_hr_accounts_survive_a_reset(seeded):
    seeded.users["second.hr@example.com"] = "second-hr"

    run_restore(seeded, hr_emails=HR_EMAILS | {"second.hr@example.com"})

    assert "second.hr@example.com" in seeded.users


def test_a_missing_seeded_application_is_recreated_and_reported_for_scoring(seeded):
    application = DATA.applications[3]
    del seeded.applications[application.id]
    del seeded.scored[application.id]

    report = run_restore(seeded)

    candidate_id = seeded.users[DATA.candidate(application.candidate).email]
    assert application_path(candidate_id, application.id) in seeded.uploads
    assert report.needs_scoring == [application.id]


@pytest.fixture
def reset_client(client, seeded):
    app.dependency_overrides[get_demo_store] = lambda: seeded
    app.dependency_overrides[get_demo_settings] = lambda: DemoSettings(hr_emails=HR_EMAILS, candidate_email=None)
    return client


def test_hr_resets_the_demo_from_the_api(reset_client, seeded):
    seeded.jobs["audience-job"] = {"id": "audience-job"}

    response = reset_client.post("/api/demo/reset")

    assert response.status_code == 200
    assert response.json() == {"deleted_applications": 0, "deleted_jobs": 1, "deleted_accounts": 0, "rescoring": 0}


def test_candidates_cannot_reset_the_demo(reset_client):
    assert reset_client.post("/api/demo/reset", headers=auth(ALICE_TOKEN)).status_code == 403


def test_reset_does_not_exist_outside_demo_mode(reset_client):
    app.dependency_overrides[get_demo_settings] = lambda: None

    assert reset_client.post("/api/demo/reset").status_code == 404

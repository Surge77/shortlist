"""Puts the demo back to its seeded state: removes what the audience added (accounts,
jobs, applications, files) and restores seeded stages, history, notes, jobs and the saved
resume. Never calls Gemini; it reports which seeded applications still need a score.
"""

import hashlib
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.demo.fixtures import SEEDED_REQUIREMENTS_VERSION, DemoApplication, DemoData
from app.demo.store import DemoStore, Row
from app.repository import SavedResume

SAVED_RESUME_NAME = "profile-demo.pdf"


@dataclass(frozen=True)
class RestoreReport:
    deleted_applications: int
    deleted_jobs: int
    deleted_accounts: int
    needs_scoring: list[str]


def _days_before(now: datetime, days: int) -> datetime:
    return now - timedelta(days=days)


def application_path(candidate_id: str, application_id: str) -> str:
    return f"{candidate_id}/{application_id}.pdf"


def _history(application: DemoApplication, created: datetime, now: datetime, hr_id: str,
             candidate_id: str) -> tuple[list[Row], list[Row]]:
    events: list[Row] = []
    previous = "submitted"
    for step, stage in enumerate(application.stages, start=1):
        # A day per move, but never in the future for a recent application.
        at = min(created + timedelta(days=step), now - timedelta(hours=len(application.stages) - step + 1))
        actor = candidate_id if stage == "withdrawn" else hr_id
        events.append({"application_id": application.id, "from_stage": previous, "to_stage": stage,
                       "actor_id": actor, "created_at": at.isoformat()})
        previous = stage
    notes = [{"application_id": application.id, "author_id": hr_id, "body": body,
              "created_at": min(created + timedelta(days=1, hours=n), now).isoformat()}
             for n, body in enumerate(application.notes)]
    return events, notes


async def _clear_audience_records(store: DemoStore, data: DemoData) -> tuple[int, int, set[str]]:
    seeded_apps = {a.id for a in data.applications}
    existing = await store.list_applications()
    doomed = [a for a in existing if a.id not in seeded_apps]
    await store.remove_files([a.resume_path for a in doomed])
    await store.delete_applications([a.id for a in doomed])
    seeded_jobs = {j.id for j in data.jobs}
    doomed_jobs = [job_id for job_id in await store.list_job_ids() if job_id not in seeded_jobs]
    await store.delete_jobs(doomed_jobs)
    return len(doomed), len(doomed_jobs), {a.id for a in existing if a.id in seeded_apps}


async def _restore_jobs_and_applications(store: DemoStore, data: DemoData, ids: dict[str, str], now: datetime,
                                         already_there: set[str]) -> None:
    hr_id = ids[data.hr_email]
    await store.upsert_jobs([{
        "id": job.id, "created_by": hr_id, "title": job.title, "department": job.department,
        "location": job.location, "employment_type": job.employment_type, "description": job.description,
        "status": job.status, "requirements": job.requirements.model_dump() if job.requirements else None,
        "requirements_version": job.requirements_version, "weights": None,
        "created_at": _days_before(now, job.days_ago).isoformat(),
    } for job in data.jobs])

    rows: list[Row] = []
    events: list[Row] = []
    notes: list[Row] = []
    for application in data.applications:
        candidate = data.candidate(application.candidate)
        candidate_id = ids[candidate.email]
        resume = candidate.resume_file.read_bytes()
        path = application_path(candidate_id, application.id)
        if application.id not in already_there:
            await store.upload_pdf(path, resume)
        created = _days_before(now, application.days_ago)
        rows.append({"id": application.id, "job_id": data.job(application.job).id, "candidate_id": candidate_id,
                     "resume_path": path, "resume_sha256": hashlib.sha256(resume).hexdigest(), "source_type": "pdf",
                     "cover_note": application.cover_note, "stage": application.stage, "created_at": created.isoformat()})
        app_events, app_notes = _history(application, created, now, hr_id, candidate_id)
        events += app_events
        notes += app_notes
    await store.upsert_applications(rows)
    await store.replace_history([a.id for a in data.applications], events, notes)


async def _restore_saved_resumes(store: DemoStore, data: DemoData, ids: dict[str, str]) -> None:
    current = await store.saved_resume_paths([ids[c.email] for c in data.candidates])
    for candidate in data.candidates:
        user_id = ids[candidate.email]
        path = f"{user_id}/{SAVED_RESUME_NAME}" if candidate.has_saved_resume else None
        if path:
            await store.upload_pdf(path, candidate.resume_file.read_bytes())
            await store.set_saved_resume(user_id, SavedResume(path=path, source_type="pdf",
                                                              filename=f"{candidate.full_name} resume.pdf"))
        elif user_id in current:
            await store.set_saved_resume(user_id, None)
        if user_id in current and current[user_id] != path:
            await store.remove_files([current[user_id]])


async def restore(store: DemoStore, data: DemoData, hr_emails: frozenset[str], now: datetime) -> RestoreReport:
    people = [(c.email, c.full_name, "candidate") for c in data.candidates] + [(data.hr_email, data.hr_name, "hr")]
    for email, name, _ in people:
        await store.create_account(email, name)
    ids = {user.email: user.id for user in await store.list_users()}
    await store.upsert_profiles([{"id": ids[email], "full_name": name, "role": role} for email, name, role in people])

    deleted_apps, deleted_jobs, already_there = await _clear_audience_records(store, data)
    await _restore_jobs_and_applications(store, data, ids, now, already_there)
    await _restore_saved_resumes(store, data, ids)

    # Last: by now nothing seeded points at these accounts.
    keep = {email for email, _, _ in people} | hr_emails
    doomed = [user_id for email, user_id in ids.items() if email not in keep]
    await store.remove_files(list((await store.saved_resume_paths(doomed)).values()))
    for user_id in doomed:
        await store.delete_account(user_id)

    pending = await store.needing_score([a.id for a in data.applications], SEEDED_REQUIREMENTS_VERSION)
    return RestoreReport(deleted_applications=deleted_apps, deleted_jobs=deleted_jobs,
                         deleted_accounts=len(doomed), needs_scoring=pending)

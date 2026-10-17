"""Applying to a job, and HR asking for an application to be scored again."""

import hashlib
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app import pipeline
from app.auth import CandidateUser, HrUser, Repo
from app.documents import MAX_UPLOAD_BYTES, InputProblem, ResumeSource, from_upload
from app.errors import UserFacingError
from app.gemini import JsonGenerator, get_generator
from app.rate_limit import APPLY_LIMIT, GEMINI_HR_LIMIT
from app.repository import NewApplication, Repository
from app.supabase_rest import DuplicateRow

Generator = Annotated[JsonGenerator, Depends(get_generator)]

router = APIRouter(prefix="/api")

MAX_COVER_NOTE_CHARS = 2000
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
EXTENSIONS = {"application/pdf": "pdf", DOCX_MIME: "docx", "image/png": "png", "image/jpeg": "jpg",
              "image/webp": "webp"}


class JobNotOpen(UserFacingError):
    status_code = 404
    user_message = "This job isn't open for applications."


class AlreadyApplied(UserFacingError):
    status_code = 409
    user_message = "You've already applied to this job."


class ApplicationNotFound(UserFacingError):
    status_code = 404
    user_message = "That application doesn't exist."


class NoSavedResume(UserFacingError):
    status_code = 404
    user_message = "You have no saved resume. Add one on your profile, or choose a file."


class ChooseOneResume(InputProblem):
    user_message = "Choose a resume file or your saved resume, not both."


class NoResumeGiven(InputProblem):
    user_message = "Choose your resume file."


class CoverNoteTooLong(InputProblem):
    status_code = 413
    user_message = f"The cover note is limited to {MAX_COVER_NOTE_CHARS:,} characters."


class Applied(BaseModel):
    id: str


class Queued(BaseModel):
    queued: int


def resume_mime(source: ResumeSource) -> str:
    return source.blob.mime_type if source.blob else DOCX_MIME


def clean_cover_note(note: str | None) -> str | None:
    text = (note or "").strip()
    if len(text) > MAX_COVER_NOTE_CHARS:
        raise CoverNoteTooLong()
    return text or None


async def resume_bytes(user_id: str, file: UploadFile | None, use_saved: bool, repo: Repository) -> bytes:
    """The resume to apply with. A saved resume is copied into the application, so
    replacing it later never changes what HR reviewed."""
    if file is not None and use_saved:
        raise ChooseOneResume()
    if file is not None:
        return await file.read(MAX_UPLOAD_BYTES + 1)
    if not use_saved:
        raise NoResumeGiven()
    saved = await repo.get_saved_resume(user_id)
    if saved is None:
        raise NoSavedResume()
    return await repo.load_resume(saved.path)


@router.post("/jobs/{job_id}/applications", response_model=Applied, status_code=201)
async def apply(
    job_id: UUID,
    user: CandidateUser,
    repo: Repo,
    generator: Generator,
    background: BackgroundTasks,
    file: Annotated[UploadFile | None, File()] = None,
    cover_note: Annotated[str | None, Form()] = None,
    use_saved_resume: Annotated[bool, Form()] = False,
) -> Applied:
    APPLY_LIMIT.check(user.id)
    job = await repo.get_job(str(job_id))
    if job is None or job.status != "open" or job.requirements is None:
        raise JobNotOpen()
    if await repo.has_applied(job.id, user.id):
        raise AlreadyApplied()
    note = clean_cover_note(cover_note)

    data = await resume_bytes(user.id, file, use_saved_resume, repo)
    # Type and size are checked from the bytes before anything is stored.
    source = await run_in_threadpool(from_upload, data)
    mime = resume_mime(source)
    application_id = str(uuid4())
    # The first folder is the candidate's id: the storage policy lets them read only that folder.
    path = f"{user.id}/{application_id}.{EXTENSIONS[mime]}"

    await repo.store_resume(path, data, mime)
    try:
        await repo.create_application(NewApplication(
            id=application_id, job_id=job.id, candidate_id=user.id, resume_path=path,
            resume_sha256=hashlib.sha256(data).hexdigest(), source_type=source.source_type, cover_note=note,
        ))
    except UserFacingError as exc:
        # No row points at the file now, so it would sit in the bucket unowned.
        await repo.delete_resume(path)
        if isinstance(exc, DuplicateRow):  # a second tab won the race with the check above
            raise AlreadyApplied() from exc
        raise

    background.add_task(pipeline.process_new, application_id, source, job, repo, generator)
    return Applied(id=application_id)


@router.post("/applications/{application_id}/rescore", response_model=Queued, status_code=202)
async def rescore_application(application_id: UUID, user: HrUser, repo: Repo, generator: Generator,
                              background: BackgroundTasks) -> Queued:
    GEMINI_HR_LIMIT.check(user.id)
    application = await repo.get_application(str(application_id))
    if application is None:
        raise ApplicationNotFound()
    await repo.set_processing(application.id, "processing")
    background.add_task(pipeline.rescore, application.id, repo, generator)
    return Queued(queued=1)

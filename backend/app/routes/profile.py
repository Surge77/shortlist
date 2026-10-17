"""A candidate's saved resume: upload once, then apply to jobs without choosing a file."""

import re
from pathlib import PureWindowsPath
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, File, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.auth import CandidateUser, Repo
from app.documents import MAX_UPLOAD_BYTES, from_upload
from app.repository import SavedResume
from app.routes.applications import EXTENSIONS, resume_mime
from app.schemas import SourceType

router = APIRouter(prefix="/api")

MAX_FILENAME_CHARS = 200
UNSAFE_FILENAME_CHARS = re.compile(r"[\x00-\x1f\x7f]")


class SavedResumeReply(BaseModel):
    filename: str
    source_type: SourceType


def clean_filename(name: str | None) -> str:
    """Only for display: the stored path never uses it. Windows paths parse both slashes."""
    base = PureWindowsPath(name or "").name
    return UNSAFE_FILENAME_CHARS.sub("", base).strip()[:MAX_FILENAME_CHARS] or "resume"


@router.put("/me/resume", response_model=SavedResumeReply)
async def save_resume(user: CandidateUser, repo: Repo, file: Annotated[UploadFile, File()]) -> SavedResumeReply:
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    source = await run_in_threadpool(from_upload, data)
    mime = resume_mime(source)
    # A fresh name each time: the old file is removed only after the profile points at the new one.
    path = f"{user.id}/profile-{uuid4()}.{EXTENSIONS[mime]}"
    previous = await repo.get_saved_resume(user.id)

    await repo.store_resume(path, data, mime)
    resume = SavedResume(path=path, source_type=source.source_type, filename=clean_filename(file.filename))
    await repo.set_saved_resume(user.id, resume)
    if previous is not None:
        await repo.delete_resume(previous.path)
    return SavedResumeReply(filename=resume.filename, source_type=resume.source_type)


@router.delete("/me/resume", status_code=204)
async def remove_resume(user: CandidateUser, repo: Repo) -> Response:
    previous = await repo.get_saved_resume(user.id)
    if previous is not None:
        await repo.set_saved_resume(user.id, None)
        await repo.delete_resume(previous.path)
    return Response(status_code=204)

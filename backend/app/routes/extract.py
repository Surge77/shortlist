"""HR's quick-extract tool: read one resume without filing an application."""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.concurrency import run_in_threadpool

from app import service
from app.auth import HrUser
from app.documents import MAX_UPLOAD_BYTES, AmbiguousInput, from_text, from_upload
from app.gemini import JsonGenerator, get_generator
from app.rate_limit import GEMINI_HR_LIMIT
from app.schemas import ExtractResponse

Generator = Annotated[JsonGenerator, Depends(get_generator)]

router = APIRouter(prefix="/api")


@router.post("/extract", response_model=ExtractResponse)
async def extract(
    user: HrUser,
    generator: Generator,
    file: Annotated[UploadFile | None, File()] = None,
    text: Annotated[str | None, Form()] = None,
) -> ExtractResponse:
    if (file is None) == (text is None):
        raise AmbiguousInput()
    GEMINI_HR_LIMIT.check(user.id)
    if file is not None:
        # Read one byte past the limit so an oversized file is detected, not truncated.
        data = await file.read(MAX_UPLOAD_BYTES + 1)
        # Parsing a Word file is CPU work; keep it off the event loop.
        source = await run_in_threadpool(from_upload, data)
    else:
        source = from_text(text or "")
    return await service.extract(source, generator)

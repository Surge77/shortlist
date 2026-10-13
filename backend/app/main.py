from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app import service
from app.config import ALLOWED_HOSTS, FRONTEND_DIST
from app.documents import MAX_UPLOAD_BYTES, AmbiguousInput, FileTooLarge, InputProblem, from_text, from_upload
from app.gemini import GeminiError, JsonGenerator, get_generator
from app.limits import BodySizeLimit
from app.schemas import ExtractResponse

Generator = Annotated[JsonGenerator, Depends(get_generator)]

# Multipart framing (boundaries, headers, a text field) on top of the largest file.
MULTIPART_OVERHEAD_BYTES = 64 * 1024
MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES


async def handle_known_error(_: Request, exc: Exception) -> JSONResponse:
    # Registered only for these two families; the guard narrows the type without
    # relying on `assert`, which `python -O` strips.
    if not isinstance(exc, (GeminiError, InputProblem)):
        raise exc
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.user_message})


def create_app() -> FastAPI:
    app = FastAPI(title="Shortlist", version="0.1.0")
    app.add_exception_handler(GeminiError, handle_known_error)
    app.add_exception_handler(InputProblem, handle_known_error)
    app.add_middleware(BodySizeLimit, max_bytes=MAX_REQUEST_BYTES, message=FileTooLarge.user_message)
    # Answer only to this machine's names, which defeats DNS-rebinding tricks that
    # point another site's hostname at 127.0.0.1.
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)

    @app.get("/api/health")
    async def health() -> dict[str, bool]:
        return {"ok": True}

    @app.post("/api/extract", response_model=ExtractResponse)
    async def extract(
        generator: Generator,
        file: Annotated[UploadFile | None, File()] = None,
        text: Annotated[str | None, Form()] = None,
    ) -> ExtractResponse:
        if (file is None) == (text is None):
            raise AmbiguousInput()
        if file is not None:
            # Read one byte past the limit so an oversized file is detected, not truncated.
            data = await file.read(MAX_UPLOAD_BYTES + 1)
            # Parsing a Word file is CPU work; keep it off the event loop.
            source = await run_in_threadpool(from_upload, data)
        else:
            source = from_text(text or "")
        return await service.extract(source, generator)

    # Demo mode: serve the built React app from the same origin as the API. Mounted last
    # so the /api routes above take precedence.
    if FRONTEND_DIST.is_dir():
        app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")

    return app


app = create_app()

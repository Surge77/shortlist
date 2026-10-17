from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import Response
from starlette.types import Scope

from app.config import ALLOWED_HOSTS, CORS_ORIGINS, FRONTEND_DIST
from app.documents import MAX_UPLOAD_BYTES, FileTooLarge
from app.errors import UserFacingError
from app.limits import BodySizeLimit
from app.routes import applications, demo, extract, health, jobs, profile

# Multipart framing (boundaries, headers, text fields) on top of the largest file.
MULTIPART_OVERHEAD_BYTES = 64 * 1024
MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES
HTTP_NOT_FOUND = 404


class SinglePageApp(StaticFiles):
    """Serves the built frontend, answering unknown paths with index.html so the
    browser-side router can handle deep links such as /hr/jobs/<id>."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code != HTTP_NOT_FOUND or path.startswith("api/"):
                raise
            return await super().get_response("index.html", scope)


async def handle_known_error(_: Request, exc: Exception) -> JSONResponse:
    # Registered only for UserFacingError; the guard narrows the type without relying on
    # `assert`, which `python -O` strips.
    if not isinstance(exc, UserFacingError):
        raise exc
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.user_message})


def create_app() -> FastAPI:
    app = FastAPI(title="Shortlist", version="0.2.0")
    app.add_exception_handler(UserFacingError, handle_known_error)
    app.add_middleware(BodySizeLimit, max_bytes=MAX_REQUEST_BYTES, message=FileTooLarge.user_message)
    # Answer only to known names, which defeats DNS-rebinding tricks that point another
    # site's hostname at this server.
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)
    if CORS_ORIGINS:
        # Bearer tokens, not cookies, so credentials stay off; origins are listed exactly.
        app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET", "POST", "PUT", "DELETE"],
                           allow_headers=["Authorization", "Content-Type"])

    # HEAD too: uptime monitors (UptimeRobot) send HEAD, and implicit HEAD-for-GET has
    # varied between Starlette releases.
    @app.api_route("/api/health", methods=["GET", "HEAD"])
    async def liveness() -> dict[str, bool]:
        return {"ok": True}

    app.include_router(health.router)
    app.include_router(extract.router)
    app.include_router(jobs.router)
    app.include_router(applications.router)
    app.include_router(demo.router)
    app.include_router(profile.router)

    # Demo mode: serve the built React app from the same origin as the API. Mounted last
    # so the /api routes above take precedence.
    if FRONTEND_DIST.is_dir():
        app.mount("/", SinglePageApp(directory=FRONTEND_DIST, html=True), name="frontend")

    return app


app = create_app()

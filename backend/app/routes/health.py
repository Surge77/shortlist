"""A health check that touches the database, for uptime monitors.

/api/health (in main.py) stays database-free: Render uses it to judge deploys, and a
Supabase hiccup must not fail a deploy. This one runs a one-row query, so the same
five-minute ping that keeps the free Render service awake also counts as activity on
the Supabase project, which pauses after a week without any.
"""

import time
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.supabase_rest import SupabaseError, SupabaseRest, get_rest

router = APIRouter(prefix="/api")

HTTP_SERVICE_UNAVAILABLE = 503
# Shorter than any monitor's interval, so every scheduled ping still reaches the
# database, while a flood of requests costs at most one query a minute.
CACHE_SECONDS = 60

clock = time.monotonic
_last_ok: float | None = None


@router.api_route("/health/db", methods=["GET", "HEAD"])
async def database_health(rest: Annotated[SupabaseRest | None, Depends(get_rest)]) -> JSONResponse:
    global _last_ok
    now = clock()
    if _last_ok is not None and now - _last_ok < CACHE_SECONDS:
        return JSONResponse({"ok": True, "database": True})
    try:
        if rest is None:
            raise SupabaseError()
        await rest.select("jobs", {"select": "id", "limit": "1"})
    except SupabaseError:
        return JSONResponse({"ok": False, "database": False}, status_code=HTTP_SERVICE_UNAVAILABLE)
    _last_ok = now
    return JSONResponse({"ok": True, "database": True})

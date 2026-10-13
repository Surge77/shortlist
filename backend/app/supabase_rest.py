"""A small async client for the three Supabase APIs the server uses: Auth, PostgREST and
Storage. httpx is already a dependency, and four calls do not justify the full SDK.

Every request carries the service role key, which bypasses row-level security, so
callers must check who is asking before they read or write on anyone's behalf.
"""

import logging
from typing import Any

import httpx

from app.config import SUPABASE_TIMEOUT_SECONDS, SupabaseSettings
from app.errors import UserFacingError

logger = logging.getLogger(__name__)

RESUME_BUCKET = "resumes"
HTTP_CONFLICT = 409
HTTP_NOT_FOUND = 404
TOKEN_REJECTION_CODES = frozenset({401, 403})
UNIQUE_VIOLATION = "23505"


class SupabaseError(UserFacingError):
    status_code = 502
    user_message = "The database is unavailable right now. Please try again."


class SupabaseNotConfigured(SupabaseError):
    status_code = 503
    user_message = "The server has no Supabase settings. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to backend/.env."


class DuplicateRow(SupabaseError):
    status_code = 409
    user_message = "That record already exists."


class SupabaseRest:
    def __init__(self, settings: SupabaseSettings, transport: httpx.AsyncBaseTransport | None = None) -> None:
        key = settings.service_role_key
        self._client = httpx.AsyncClient(
            base_url=settings.url,
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            timeout=SUPABASE_TIMEOUT_SECONDS,
            transport=transport,
        )

    async def _send(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        try:
            response = await self._client.request(method, url, **kwargs)
        except httpx.HTTPError as exc:
            logger.warning("Supabase network error: %s", type(exc).__name__)
            raise SupabaseError() from exc
        return response

    @staticmethod
    def _raise_for(response: httpx.Response) -> None:
        if response.is_success:
            return
        if response.status_code == HTTP_CONFLICT and UNIQUE_VIOLATION in response.text:
            raise DuplicateRow()
        # Status only: PostgREST bodies can echo row values, which may be personal data.
        logger.warning("Supabase error %s on %s", response.status_code, response.request.url.path)
        raise SupabaseError()

    async def user_id_for_token(self, token: str) -> str | None:
        """Asks Supabase Auth whose session token this is; None when it is not valid."""
        response = await self._send("GET", "/auth/v1/user", headers={"Authorization": f"Bearer {token}"})
        if response.status_code in TOKEN_REJECTION_CODES:
            return None
        self._raise_for(response)
        user_id = response.json().get("id")
        return user_id if isinstance(user_id, str) else None

    async def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        response = await self._send("GET", f"/rest/v1/{table}", params=params)
        self._raise_for(response)
        rows = response.json()
        return rows if isinstance(rows, list) else []

    async def insert(self, table: str, row: dict[str, Any], *, upsert: bool = False) -> None:
        prefer = "return=minimal" + (",resolution=merge-duplicates" if upsert else "")
        response = await self._send("POST", f"/rest/v1/{table}", json=row, headers={"Prefer": prefer})
        self._raise_for(response)

    async def update(self, table: str, filters: dict[str, str], values: dict[str, Any]) -> None:
        response = await self._send("PATCH", f"/rest/v1/{table}", params=filters, json=values,
                                    headers={"Prefer": "return=minimal"})
        self._raise_for(response)

    async def upload(self, path: str, data: bytes, content_type: str) -> None:
        response = await self._send("POST", f"/storage/v1/object/{RESUME_BUCKET}/{path}", content=data,
                                    headers={"Content-Type": content_type, "x-upsert": "false"})
        self._raise_for(response)

    async def download(self, path: str) -> bytes:
        response = await self._send("GET", f"/storage/v1/object/{RESUME_BUCKET}/{path}")
        self._raise_for(response)
        return response.content

    async def remove(self, path: str) -> None:
        response = await self._send("DELETE", f"/storage/v1/object/{RESUME_BUCKET}", json={"prefixes": [path]})
        if response.status_code != HTTP_NOT_FOUND:
            self._raise_for(response)

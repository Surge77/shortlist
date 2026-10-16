"""A small async client for the three Supabase APIs the server uses: Auth, PostgREST and
Storage. httpx is already a dependency, and four calls do not justify the full SDK.

Every request carries the service role key, which bypasses row-level security, so
callers must check who is asking before they read or write on anyone's behalf.
"""

import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import httpx

from app.config import SUPABASE_TIMEOUT_SECONDS, SupabaseSettings, supabase_settings
from app.errors import UserFacingError

logger = logging.getLogger(__name__)

RESUME_BUCKET = "resumes"
HTTP_CONFLICT = 409
HTTP_NOT_FOUND = 404
TOKEN_REJECTION_CODES = frozenset({401, 403})
UNIQUE_VIOLATION = "23505"
USERS_PER_PAGE = 1000
# Supabase Auth has answered "already registered" with 422 (current) and 400 (older
# releases), as an error code or only in the message.
ACCOUNT_EXISTS_CODES = frozenset({400, 422})
ACCOUNT_EXISTS_HINTS = ("email_exists", "already been registered")


@dataclass(frozen=True)
class MagicLink:
    user_id: str
    token_hash: str


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str


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

    async def delete(self, table: str, filters: dict[str, str]) -> None:
        response = await self._send("DELETE", f"/rest/v1/{table}", params=filters, headers={"Prefer": "return=minimal"})
        self._raise_for(response)

    async def upload(self, path: str, data: bytes, content_type: str, *, upsert: bool = False) -> None:
        response = await self._send("POST", f"/storage/v1/object/{RESUME_BUCKET}/{path}", content=data,
                                    headers={"Content-Type": content_type, "x-upsert": str(upsert).lower()})
        self._raise_for(response)

    async def download(self, path: str) -> bytes:
        response = await self._send("GET", f"/storage/v1/object/{RESUME_BUCKET}/{path}")
        self._raise_for(response)
        return response.content

    async def remove(self, path: str) -> None:
        response = await self._send("DELETE", f"/storage/v1/object/{RESUME_BUCKET}", json={"prefixes": [path]})
        if response.status_code != HTTP_NOT_FOUND:
            self._raise_for(response)

    # Auth admin API: demo sign-in and the demo seed/reset only.

    async def admin_create_user(self, email: str, full_name: str | None) -> None:
        """Creates a confirmed account; an existing account for the email is left as it is."""
        response = await self._send("POST", "/auth/v1/admin/users", json={
            "email": email, "email_confirm": True, "user_metadata": {"full_name": full_name},
        })
        if response.status_code in ACCOUNT_EXISTS_CODES and any(hint in response.text for hint in ACCOUNT_EXISTS_HINTS):
            return
        self._raise_for(response)

    async def admin_magic_link(self, email: str) -> MagicLink:
        """A one-time sign-in token for an existing account. Nothing is emailed: the
        browser exchanges the hashed token for a session with verifyOtp."""
        response = await self._send("POST", "/auth/v1/admin/generate_link", json={"type": "magiclink", "email": email})
        self._raise_for(response)
        body = response.json()
        user_id, token_hash = body.get("id"), body.get("hashed_token")
        if not isinstance(user_id, str) or not isinstance(token_hash, str):
            logger.warning("Supabase generate_link answered without a user id or token")
            raise SupabaseError()
        return MagicLink(user_id=user_id, token_hash=token_hash)

    async def admin_list_users(self) -> list[AuthUser]:
        users: list[AuthUser] = []
        page = 1
        while True:
            response = await self._send("GET", "/auth/v1/admin/users",
                                        params={"page": str(page), "per_page": str(USERS_PER_PAGE)})
            self._raise_for(response)
            batch = response.json().get("users") or []
            users += [AuthUser(id=u["id"], email=(u.get("email") or "").lower()) for u in batch]
            if len(batch) < USERS_PER_PAGE:
                return users
            page += 1

    async def admin_delete_user(self, user_id: str) -> None:
        response = await self._send("DELETE", f"/auth/v1/admin/users/{user_id}")
        if response.status_code != HTTP_NOT_FOUND:
            self._raise_for(response)


@lru_cache(maxsize=1)
def get_rest() -> SupabaseRest | None:
    """One client (and connection pool) for the whole process; None without settings."""
    settings = supabase_settings()
    return SupabaseRest(settings) if settings else None

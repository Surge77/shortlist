"""The operations the demo seed and reset need, over Supabase with the service role.

Bulk calls where PostgREST allows them, so a reset is a few dozen requests rather than
hundreds; the restore logic in reset.py depends only on the protocol, and tests fake it.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol
from uuid import UUID

from app.repository import SavedResume
from app.supabase_rest import AuthUser, SupabaseRest

PDF_MIME = "application/pdf"
Row = dict[str, Any]


@dataclass(frozen=True)
class StoredApplication:
    id: str
    resume_path: str


class DemoStore(Protocol):
    async def create_account(self, email: str, full_name: str) -> None: ...
    async def list_users(self) -> list[AuthUser]: ...
    async def delete_account(self, user_id: str) -> None: ...
    async def upsert_profiles(self, rows: list[Row]) -> None: ...
    async def list_applications(self) -> list[StoredApplication]: ...
    async def delete_applications(self, ids: list[str]) -> None: ...
    async def list_job_ids(self) -> list[str]: ...
    async def delete_jobs(self, ids: list[str]) -> None: ...
    async def upsert_jobs(self, rows: list[Row]) -> None: ...
    async def upsert_applications(self, rows: list[Row]) -> None: ...
    async def replace_history(self, application_ids: list[str], events: list[Row], notes: list[Row]) -> None: ...
    async def saved_resume_paths(self, user_ids: list[str]) -> dict[str, str]: ...
    async def set_saved_resume(self, user_id: str, resume: SavedResume | None) -> None: ...
    async def upload_pdf(self, path: str, data: bytes) -> None: ...
    async def remove_files(self, paths: list[str]) -> None: ...
    async def needing_score(self, application_ids: list[str], requirements_version: int) -> list[str]: ...


def _in(ids: list[str]) -> str:
    # Ids are interpolated into a PostgREST filter, so only well-formed UUIDs get in.
    return f"in.({','.join(str(UUID(value)) for value in ids)})"


def _one(value: Any) -> Any:
    # PostgREST embeds a one-to-one row as an object or a one-item list.
    return (value[0] if value else None) if isinstance(value, list) else value


class SupabaseDemoStore:
    def __init__(self, rest: SupabaseRest) -> None:
        self._rest = rest

    async def create_account(self, email: str, full_name: str) -> None:
        await self._rest.admin_create_user(email, full_name)

    async def list_users(self) -> list[AuthUser]:
        return await self._rest.admin_list_users()

    async def delete_account(self, user_id: str) -> None:
        await self._rest.admin_delete_user(user_id)

    async def upsert_profiles(self, rows: list[Row]) -> None:
        await self._rest.insert("profiles", rows, upsert=True)

    async def list_applications(self) -> list[StoredApplication]:
        rows = await self._rest.select("applications", {"select": "id,resume_path"})
        return [StoredApplication(id=row["id"], resume_path=row["resume_path"]) for row in rows]

    async def delete_applications(self, ids: list[str]) -> None:
        if ids:
            await self._rest.delete("applications", {"id": _in(ids)})

    async def list_job_ids(self) -> list[str]:
        return [row["id"] for row in await self._rest.select("jobs", {"select": "id"})]

    async def delete_jobs(self, ids: list[str]) -> None:
        if ids:
            await self._rest.delete("jobs", {"id": _in(ids)})

    async def upsert_jobs(self, rows: list[Row]) -> None:
        await self._rest.insert("jobs", rows, upsert=True)

    async def upsert_applications(self, rows: list[Row]) -> None:
        await self._rest.insert("applications", rows, upsert=True)

    async def replace_history(self, application_ids: list[str], events: list[Row], notes: list[Row]) -> None:
        await self._rest.delete("stage_events", {"application_id": _in(application_ids)})
        await self._rest.delete("notes", {"application_id": _in(application_ids)})
        if events:
            await self._rest.insert("stage_events", events)
        if notes:
            await self._rest.insert("notes", notes)

    async def saved_resume_paths(self, user_ids: list[str]) -> dict[str, str]:
        if not user_ids:
            return {}
        rows = await self._rest.select("profiles", {"select": "id,resume_path", "id": _in(user_ids),
                                                    "resume_path": "not.is.null"})
        return {row["id"]: row["resume_path"] for row in rows}

    async def set_saved_resume(self, user_id: str, resume: SavedResume | None) -> None:
        await self._rest.update("profiles", {"id": f"eq.{user_id}"}, {
            "resume_path": resume.path if resume else None,
            "resume_source_type": resume.source_type if resume else None,
            "resume_filename": resume.filename if resume else None,
            "resume_updated_at": datetime.now(UTC).isoformat() if resume else None,
        })

    async def upload_pdf(self, path: str, data: bytes) -> None:
        await self._rest.upload(path, data, PDF_MIME, upsert=True)

    async def remove_files(self, paths: list[str]) -> None:
        if paths:
            await self._rest.remove_many(paths)

    async def needing_score(self, application_ids: list[str], requirements_version: int) -> list[str]:
        rows = await self._rest.select("applications", {
            "select": "id,processing_status,scores(requirements_version)", "id": _in(application_ids)})
        pending = []
        for row in rows:
            score = _one(row.get("scores"))
            if row["processing_status"] != "scored" or score is None or score["requirements_version"] != requirements_version:
                pending.append(row["id"])
        return pending

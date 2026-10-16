"""Signing someone in by email alone, for demonstrations.

The result is an ordinary Supabase session: the browser exchanges the token returned here
with verifyOtp, so row-level security sees a real user with a real role, exactly as it
would after a password sign-in.
"""

from typing import Literal, Protocol

from app.supabase_rest import SupabaseRest

DemoRole = Literal["candidate", "hr"]


class DemoAccounts(Protocol):
    async def sign_in_token(self, email: str, full_name: str | None, role: DemoRole) -> str: ...


class SupabaseDemoAccounts:
    def __init__(self, rest: SupabaseRest) -> None:
        self._rest = rest

    async def sign_in_token(self, email: str, full_name: str | None, role: DemoRole) -> str:
        # The database trigger creates the profile (as a candidate) with the account.
        await self._rest.admin_create_user(email, full_name)
        link = await self._rest.admin_magic_link(email)
        # Set on every sign-in, before the token leaves the server, so the allowlist alone
        # decides who is HR: removing an email from it demotes that account next time.
        await self._rest.update("profiles", {"id": f"eq.{link.user_id}"}, {"role": role})
        return link.token_hash

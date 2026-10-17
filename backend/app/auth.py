"""Who is calling. The browser sends its Supabase session token; Supabase Auth says whose it
is, and the profile row says whether they are a candidate or HR.

Asking Supabase rather than checking the JWT locally costs one request, but works with
both legacy and asymmetric signing keys and honours sign-outs immediately.
"""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header

from app.errors import UserFacingError
from app.repository import Repository, Role, get_repository

BEARER_PREFIX = "bearer "


class NotSignedIn(UserFacingError):
    status_code = 401
    user_message = "Sign in to continue."


class NotAllowed(UserFacingError):
    status_code = 403
    user_message = "Your account can't do that."


@dataclass(frozen=True)
class CurrentUser:
    id: str
    role: Role


Repo = Annotated[Repository, Depends(get_repository)]


def bearer_token(authorization: str | None) -> str | None:
    if not authorization or not authorization.lower().startswith(BEARER_PREFIX):
        return None
    token = authorization[len(BEARER_PREFIX):].strip()
    return token or None


async def current_user(repo: Repo, authorization: Annotated[str | None, Header()] = None) -> CurrentUser:
    token = bearer_token(authorization)
    if token is None:
        raise NotSignedIn()
    user_id = await repo.user_id_for_token(token)
    if user_id is None:
        raise NotSignedIn()
    role = await repo.role_of(user_id)
    if role is None:
        raise NotSignedIn()
    return CurrentUser(id=user_id, role=role)


async def require_hr(user: Annotated[CurrentUser, Depends(current_user)]) -> CurrentUser:
    if user.role != "hr":
        raise NotAllowed()
    return user


async def require_candidate(user: Annotated[CurrentUser, Depends(current_user)]) -> CurrentUser:
    if user.role != "candidate":
        raise NotAllowed()
    return user


HrUser = Annotated[CurrentUser, Depends(require_hr)]
CandidateUser = Annotated[CurrentUser, Depends(require_candidate)]

"""Email-only sign-in for demonstrations. Exists only when DEMO_LOGIN is on.

Anyone who knows an allowlisted email can sign in as HR: acceptable for a demo that holds
fictional data only, which is why the mode is off unless deliberately turned on.
"""

import re
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from pydantic import BaseModel, field_validator

from app import pipeline
from app.auth import HrUser, Repo
from app.config import DemoSettings, demo_settings
from app.demo.accounts import DemoAccounts, SupabaseDemoAccounts
from app.demo.fixtures import load_fixtures
from app.demo.reset import restore
from app.demo.store import DemoStore, SupabaseDemoStore
from app.errors import UserFacingError
from app.gemini import JsonGenerator, get_generator
from app.rate_limit import DEMO_LOGIN_LIMIT, DEMO_RESET_LIMIT
from app.supabase_rest import SupabaseNotConfigured, get_rest

router = APIRouter(prefix="/api")

MAX_EMAIL_CHARS = 254
MAX_NAME_CHARS = 120
# Deliberately plain: one @, a dot in the domain, no spaces. Supabase Auth validates again.
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
NAME_SEPARATORS = re.compile(r"[._+\-\d]+")


class DemoLoginOff(UserFacingError):
    status_code = 404
    user_message = "Email-only sign-in is turned off."


class DemoLoginRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def normalise(cls, value: str) -> str:
        email = value.strip().lower()
        if len(email) > MAX_EMAIL_CHARS or not EMAIL_PATTERN.match(email):
            raise ValueError("Enter a valid email address")
        return email


class DemoLoginReply(BaseModel):
    # Single use and short-lived; exchanged by the browser for its own session.
    token_hash: str


class ResetReply(BaseModel):
    deleted_applications: int
    deleted_jobs: int
    deleted_accounts: int
    rescoring: int


class AuthOptions(BaseModel):
    demo: bool
    hr_email: str | None
    candidate_email: str | None


def get_demo_settings() -> DemoSettings | None:
    return demo_settings()


def get_demo_accounts() -> DemoAccounts:
    rest = get_rest()
    if rest is None:
        raise SupabaseNotConfigured()
    return SupabaseDemoAccounts(rest)


Demo = Annotated[DemoSettings | None, Depends(get_demo_settings)]


def name_from_email(email: str) -> str | None:
    """'riya.demo@example.com' -> 'Riya Demo'. People can change it on their profile."""
    parts = [part for part in NAME_SEPARATORS.split(email.split("@")[0]) if part]
    return " ".join(part.capitalize() for part in parts)[:MAX_NAME_CHARS] or None


@router.get("/auth/options", response_model=AuthOptions)
async def options(demo: Demo) -> AuthOptions:
    if demo is None:
        return AuthOptions(demo=False, hr_email=None, candidate_email=None)
    hr_email = min(demo.hr_emails) if demo.hr_emails else None
    return AuthOptions(demo=True, hr_email=hr_email, candidate_email=demo.candidate_email)


def get_demo_store() -> DemoStore:
    rest = get_rest()
    if rest is None:
        raise SupabaseNotConfigured()
    return SupabaseDemoStore(rest)


@router.post("/demo/reset", response_model=ResetReply)
async def reset_demo(user: HrUser, demo: Demo, store: Annotated[DemoStore, Depends(get_demo_store)], repo: Repo,
                     generator: Annotated[JsonGenerator, Depends(get_generator)],
                     background: BackgroundTasks) -> ResetReply:
    if demo is None:
        raise DemoLoginOff()
    DEMO_RESET_LIMIT.check(user.id)
    report = await restore(store, load_fixtures(), demo.hr_emails, datetime.now(UTC))
    # Normally empty: only a seeded application someone removed from the database needs it.
    if report.needs_scoring:
        background.add_task(pipeline.rescore_all, report.needs_scoring, repo, generator)
    return ResetReply(deleted_applications=report.deleted_applications, deleted_jobs=report.deleted_jobs,
                      deleted_accounts=report.deleted_accounts, rescoring=len(report.needs_scoring))


@router.post("/auth/demo-login", response_model=DemoLoginReply)
async def demo_login(body: DemoLoginRequest, request: Request, demo: Demo,
                     accounts: Annotated[DemoAccounts, Depends(get_demo_accounts)]) -> DemoLoginReply:
    if demo is None:
        raise DemoLoginOff()
    DEMO_LOGIN_LIMIT.check(f"ip:{request.client.host if request.client else 'unknown'}")
    role = "hr" if body.email in demo.hr_emails else "candidate"
    token = await accounts.sign_in_token(body.email, name_from_email(body.email), role)
    return DemoLoginReply(token_hash=token)

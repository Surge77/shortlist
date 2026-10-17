import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIST = BACKEND_DIR.parent / "frontend" / "dist"

load_dotenv(BACKEND_DIR / ".env")


def _env_list(name: str) -> list[str]:
    return [item.strip() for item in os.environ.get(name, "").split(",") if item.strip()]


# This machine's names, plus the deployed hostname(s) when the API runs elsewhere.
ALLOWED_HOSTS = ["127.0.0.1", "localhost", *_env_list("EXTRA_ALLOWED_HOSTS")]
# Empty unless the frontend is served from another origin; same-origin needs no CORS.
CORS_ORIGINS = _env_list("CORS_ORIGINS")
MODEL_NAME = "gemini-flash-lite-latest"
# Reading a multi-page PDF or a photo takes longer than a text prompt. The SDK takes
# this value in milliseconds.
REQUEST_TIMEOUT_MS = 60_000
# Extraction should copy, not create: zero temperature keeps the same resume giving the
# same answer.
TEMPERATURE = 0.0
SUPABASE_TIMEOUT_SECONDS = 15.0


@dataclass(frozen=True)
class SupabaseSettings:
    url: str
    # Bypasses row-level security. Server-side only; never sent to a browser.
    service_role_key: str


@dataclass(frozen=True)
class DemoSettings:
    # Who signs in as HR. Read on every sign-in, so this list alone decides the role.
    hr_emails: frozenset[str]
    # The account behind the sign-in page's one-click candidate button.
    candidate_email: str | None


def demo_settings() -> DemoSettings | None:
    """Email-only sign-in for demonstrations; None (the default) keeps password sign-in."""
    if os.environ.get("DEMO_LOGIN", "").strip().lower() not in ("1", "true", "yes"):
        return None
    hr_emails = frozenset(email.lower() for email in _env_list("DEMO_HR_EMAILS"))
    candidate_email = os.environ.get("DEMO_CANDIDATE_EMAIL", "").strip().lower() or None
    return DemoSettings(hr_emails=hr_emails, candidate_email=candidate_email)


def gemini_api_key() -> str | None:
    return os.environ.get("GEMINI_API_KEY") or None


def supabase_settings() -> SupabaseSettings | None:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        return None
    return SupabaseSettings(url=url, service_role_key=key)

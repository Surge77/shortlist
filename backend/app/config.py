import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIST = BACKEND_DIR.parent / "frontend" / "dist"

load_dotenv(BACKEND_DIR / ".env")

ALLOWED_HOSTS = ["127.0.0.1", "localhost"]
MODEL_NAME = "gemini-flash-lite-latest"
# Reading a multi-page PDF or a photo takes longer than a text prompt. The SDK takes
# this value in milliseconds.
REQUEST_TIMEOUT_MS = 60_000
# Extraction should copy, not create: zero temperature keeps the same resume giving the
# same answer.
TEMPERATURE = 0.0


def gemini_api_key() -> str | None:
    return os.environ.get("GEMINI_API_KEY") or None

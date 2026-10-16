from collections.abc import Iterator
from typing import TypeVar

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.documents import FileBlob
from app.gemini import Content, get_generator
from app.main import app
from app.rate_limit import APPLY_LIMIT, DEMO_LOGIN_LIMIT, DEMO_LOGIN_TOTAL_LIMIT, DEMO_RESET_LIMIT, GEMINI_HR_LIMIT
from app.repository import get_repository
from tests.fakes import HR_TOKEN, FakeRepository

ModelT = TypeVar("ModelT", bound=BaseModel)


class FakeGenerator:
    """Stands in for Gemini: returns queued replies and records what it was sent."""

    def __init__(self) -> None:
        self.replies: list[BaseModel | Exception] = []
        self.calls: list[list[Content]] = []

    async def generate(self, contents: list[Content], schema: type[ModelT]) -> ModelT:
        self.calls.append(contents)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        assert isinstance(reply, schema)
        return reply

    def sent_text(self) -> str:
        return "\n".join(part for part in self.calls[-1] if isinstance(part, str))

    def sent_files(self) -> list[FileBlob]:
        return [part for part in self.calls[-1] if isinstance(part, FileBlob)]


@pytest.fixture
def fake_generator() -> FakeGenerator:
    return FakeGenerator()


@pytest.fixture(autouse=True)
def fresh_rate_limits() -> Iterator[None]:
    yield
    for limiter in (APPLY_LIMIT, GEMINI_HR_LIMIT, DEMO_LOGIN_LIMIT, DEMO_LOGIN_TOTAL_LIMIT, DEMO_RESET_LIMIT):
        limiter._calls.clear()


@pytest.fixture
def fake_repo() -> FakeRepository:
    return FakeRepository()


@pytest.fixture
def client(fake_generator: FakeGenerator, fake_repo: FakeRepository) -> Iterator[TestClient]:
    app.dependency_overrides[get_generator] = lambda: fake_generator
    app.dependency_overrides[get_repository] = lambda: fake_repo
    # The app only answers to localhost names, as a browser on this machine would send.
    # Signed in as HR by default; tests about other callers pass their own header.
    headers = {"Authorization": f"Bearer {HR_TOKEN}"}
    with TestClient(app, base_url="http://127.0.0.1", headers=headers) as test_client:
        yield test_client
    app.dependency_overrides.clear()

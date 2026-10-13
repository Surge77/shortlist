from collections.abc import Iterator
from typing import TypeVar

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.documents import FileBlob
from app.gemini import Content, get_generator
from app.main import app

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


@pytest.fixture
def client(fake_generator: FakeGenerator) -> Iterator[TestClient]:
    app.dependency_overrides[get_generator] = lambda: fake_generator
    # The app only answers to localhost names, as a browser on this machine would send.
    with TestClient(app, base_url="http://127.0.0.1") as test_client:
        yield test_client
    app.dependency_overrides.clear()

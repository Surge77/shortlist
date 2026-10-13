import asyncio
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient
from google.genai import errors, types

from app import gemini
from app.documents import FileBlob
from app.gemini import (
    GeminiBadOutput,
    GeminiKeyRejected,
    GeminiNotConfigured,
    GeminiRateLimited,
    GeminiRequestRejected,
    GeminiUnavailable,
    get_generator,
    map_api_error,
    parse_output,
)
from app.main import app
from tests.factories import a_candidate


@pytest.mark.parametrize(
    "code, message, expected",
    [
        (429, "quota", GeminiRateLimited),
        # Google answers a bad key with 400 INVALID_ARGUMENT, not 401.
        (400, "API key not valid. Please pass a valid API key.", GeminiKeyRejected),
        (400, "Request contains an invalid argument.", GeminiRequestRejected),
        (401, None, GeminiKeyRejected),
        (403, None, GeminiKeyRejected),
        (500, None, GeminiUnavailable),
    ],
)
def test_api_error_codes_map_to_user_facing_errors(code, message, expected):
    assert isinstance(map_api_error(code, message), expected)


def test_parse_output_returns_the_validated_model():
    text = a_candidate().model_dump_json()

    assert parse_output(text, type(a_candidate())).full_name == "Asha Verma"


@pytest.mark.parametrize("text", [None, "", "not json", '{"full_name": "Asha"}'])
def test_parse_output_rejects_missing_or_malformed_json(text):
    with pytest.raises(GeminiBadOutput):
        parse_output(text, type(a_candidate()))


class StubModels:
    def __init__(self, outcome) -> None:
        self.outcome = outcome
        self.calls: list[dict] = []

    async def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return SimpleNamespace(text=self.outcome)


def generator_returning(outcome) -> tuple[gemini.GeminiGenerator, StubModels]:
    models = StubModels(outcome)
    generator = gemini.GeminiGenerator("test-key-not-real")
    generator._client = SimpleNamespace(aio=SimpleNamespace(models=models))  # type: ignore[assignment]
    return generator, models


def test_files_are_sent_as_inline_parts_beside_the_prompt():
    generator, models = generator_returning(a_candidate().model_dump_json())

    asyncio.run(generator.generate(["read this", FileBlob(b"%PDF-1.7", "application/pdf")], type(a_candidate())))

    contents = models.calls[0]["contents"]
    assert contents[0] == "read this"
    assert isinstance(contents[1], types.Part)
    assert models.calls[0]["config"].response_mime_type == "application/json"


@pytest.mark.parametrize(
    "outcome, expected",
    [
        (errors.ClientError(429, {"error": {"message": "quota"}}), GeminiRateLimited),
        (errors.ServerError(503, {"error": {"message": "overloaded"}}), GeminiUnavailable),
        (httpx.ReadTimeout("slow"), GeminiUnavailable),
    ],
)
def test_sdk_failures_become_user_facing_errors(outcome, expected):
    generator, _ = generator_returning(outcome)

    with pytest.raises(expected):
        asyncio.run(generator.generate(["prompt"], type(a_candidate())))


def test_missing_key_gives_a_setup_message_but_still_validates_input(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    get_generator.cache_clear()

    with TestClient(app, base_url="http://127.0.0.1") as client:
        valid = client.post("/api/extract", data={"text": "resume"})
        invalid = client.post("/api/extract")

    assert valid.status_code == 503
    assert valid.json() == {"detail": GeminiNotConfigured().user_message}
    assert invalid.status_code == 422
    get_generator.cache_clear()


def test_generator_is_built_once_from_the_api_key(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-not-real")
    get_generator.cache_clear()

    first = get_generator()

    assert isinstance(first, gemini.GeminiGenerator)
    assert get_generator() is first
    get_generator.cache_clear()

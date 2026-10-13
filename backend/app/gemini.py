"""The only module that talks to Gemini. Everything else depends on the `JsonGenerator` protocol."""

import logging
from functools import lru_cache
from typing import Protocol, TypeVar

import httpx
from google import genai
from google.genai import errors, types
from pydantic import BaseModel, ValidationError

from app.config import MODEL_NAME, REQUEST_TIMEOUT_MS, TEMPERATURE, gemini_api_key
from app.documents import FileBlob

logger = logging.getLogger(__name__)

ModelT = TypeVar("ModelT", bound=BaseModel)
# A request is the prompt text plus, for PDFs and images, the file itself.
Content = str | FileBlob

HTTP_BAD_REQUEST = 400
HTTP_TOO_MANY_REQUESTS = 429
KEY_REJECTION_CODES = frozenset({401, 403})


class GeminiError(Exception):
    status_code = 502
    user_message = "Gemini is unavailable right now. Please try again."


class GeminiNotConfigured(GeminiError):
    status_code = 503
    user_message = "The server has no GEMINI_API_KEY. Add it to backend/.env and restart."


class GeminiKeyRejected(GeminiError):
    status_code = 503
    user_message = "Gemini rejected the request. Check GEMINI_API_KEY in backend/.env."


class GeminiRateLimited(GeminiError):
    status_code = 429
    user_message = "Too many requests to Gemini. Wait a minute and try again."


class GeminiRequestRejected(GeminiError):
    user_message = "Gemini could not read this file. Try a PDF, or paste the resume text instead."


class GeminiUnavailable(GeminiError):
    pass


class GeminiBadOutput(GeminiError):
    user_message = "Gemini returned an answer we could not read. Please try again."


class JsonGenerator(Protocol):
    async def generate(self, contents: list[Content], schema: type[ModelT]) -> ModelT: ...


def map_api_error(code: int, message: str | None) -> GeminiError:
    if code == HTTP_TOO_MANY_REQUESTS:
        return GeminiRateLimited()
    # Google reports an invalid key as 400 INVALID_ARGUMENT, so a 400 is only a key
    # problem when its message says so; any other 400 is a request Gemini refused.
    is_key_message = "api key" in (message or "").lower()
    if code in KEY_REJECTION_CODES or (code == HTTP_BAD_REQUEST and is_key_message):
        return GeminiKeyRejected()
    if code == HTTP_BAD_REQUEST:
        return GeminiRequestRejected()
    return GeminiUnavailable()


def parse_output(text: str | None, schema: type[ModelT]) -> ModelT:
    # `response.parsed` silently stays None when validation fails, so validate the raw
    # text ourselves and turn a bad answer into an error the user can act on.
    if not text:
        raise GeminiBadOutput()
    try:
        return schema.model_validate_json(text)
    except ValidationError as exc:
        raise GeminiBadOutput() from exc


def _to_part(content: Content) -> str | types.Part:
    if isinstance(content, FileBlob):
        return types.Part.from_bytes(data=content.data, mime_type=content.mime_type)
    return content


class GeminiGenerator:
    def __init__(self, api_key: str) -> None:
        self._client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT_MS),
        )

    async def generate(self, contents: list[Content], schema: type[ModelT]) -> ModelT:
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=schema,
            temperature=TEMPERATURE,
        )
        try:
            response = await self._client.aio.models.generate_content(
                model=MODEL_NAME, contents=[_to_part(content) for content in contents], config=config
            )
        except errors.APIError as exc:
            logger.warning("Gemini API error %s %s", exc.code, exc.status)
            raise map_api_error(exc.code, exc.message) from exc
        except httpx.HTTPError as exc:
            logger.warning("Gemini network error: %s", type(exc).__name__)
            raise GeminiUnavailable() from exc
        return parse_output(response.text, schema)


class MissingKeyGenerator:
    """Used when no key is configured. Fails only when asked to generate.

    FastAPI resolves dependencies before it validates the request body, so raising from
    the dependency itself would turn a bad request into a 503 instead of a 422.
    """

    async def generate(self, contents: list[Content], schema: type[ModelT]) -> ModelT:
        raise GeminiNotConfigured()


@lru_cache(maxsize=1)
def get_generator() -> JsonGenerator:
    api_key = gemini_api_key()
    if api_key is None:
        return MissingKeyGenerator()
    return GeminiGenerator(api_key)

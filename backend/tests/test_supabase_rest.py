import asyncio
import json

import httpx
import pytest

from app.config import SupabaseSettings
from app.repository import NewApplication, SupabaseRepository
from app.requirements import JobRequirements, Weights
from app.scoring import ScoreResult
from app.supabase_rest import DuplicateRow, SupabaseError, SupabaseNotConfigured, SupabaseRest
from tests.factories import a_candidate

SETTINGS = SupabaseSettings(url="https://project.supabase.co", service_role_key="service-key-not-real")


class Recorder:
    """A transport that answers from a handler and remembers every request."""

    def __init__(self, handler) -> None:
        self.requests: list[httpx.Request] = []
        self._handler = handler

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return self._handler(request)


def client_with(handler) -> tuple[SupabaseRest, Recorder]:
    recorder = Recorder(handler)
    return SupabaseRest(SETTINGS, transport=httpx.MockTransport(recorder)), recorder


def run(coro):
    return asyncio.run(coro)


def test_every_request_carries_the_service_key():
    rest, recorder = client_with(lambda _: httpx.Response(200, json=[]))

    run(rest.select("jobs", {"id": "eq.1"}))

    request = recorder.requests[0]
    assert request.headers["apikey"] == SETTINGS.service_role_key
    assert request.url.path == "/rest/v1/jobs"
    assert request.url.params["id"] == "eq.1"


def test_a_user_token_is_checked_with_supabase_auth():
    rest, recorder = client_with(lambda _: httpx.Response(200, json={"id": "user-1"}))

    assert run(rest.user_id_for_token("user-jwt")) == "user-1"
    assert recorder.requests[0].headers["Authorization"] == "Bearer user-jwt"
    assert recorder.requests[0].url.path == "/auth/v1/user"


@pytest.mark.parametrize("status", [401, 403])
def test_a_rejected_token_means_nobody(status):
    rest, _ = client_with(lambda _: httpx.Response(status, json={"msg": "invalid JWT"}))

    assert run(rest.user_id_for_token("expired")) is None


def test_a_unique_violation_becomes_duplicate_row():
    rest, _ = client_with(lambda _: httpx.Response(409, json={"code": "23505", "message": "duplicate key"}))

    with pytest.raises(DuplicateRow):
        run(rest.insert("applications", {"id": "x"}))


def test_other_failures_become_a_generic_database_error():
    rest, _ = client_with(lambda _: httpx.Response(500, text="boom"))

    with pytest.raises(SupabaseError) as caught:
        run(rest.update("applications", {"id": "eq.1"}, {"stage": "hired"}))
    assert type(caught.value) is SupabaseError


def test_network_errors_become_a_database_error():
    def refuse(request):
        raise httpx.ConnectError("refused", request=request)

    rest, _ = client_with(refuse)

    with pytest.raises(SupabaseError):
        run(rest.select("jobs", {}))


def test_upsert_asks_postgrest_to_merge():
    rest, recorder = client_with(lambda _: httpx.Response(201))

    run(rest.insert("scores", {"application_id": "a"}, upsert=True))

    assert "resolution=merge-duplicates" in recorder.requests[0].headers["Prefer"]


def test_storage_upload_download_and_remove():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(200, content=b"%PDF-1.7")
        if request.method == "DELETE":
            return httpx.Response(404)  # already gone is fine
        return httpx.Response(200, json={"Key": "resumes/a/b.pdf"})

    rest, recorder = client_with(handler)

    run(rest.upload("a/b.pdf", b"%PDF-1.7", "application/pdf"))
    assert run(rest.download("a/b.pdf")) == b"%PDF-1.7"
    run(rest.remove("a/b.pdf"))

    upload, download, remove = recorder.requests
    assert upload.url.path == "/storage/v1/object/resumes/a/b.pdf"
    assert upload.headers["x-upsert"] == "false"
    assert download.url.path == "/storage/v1/object/resumes/a/b.pdf"
    assert json.loads(remove.content) == {"prefixes": ["a/b.pdf"]}


def test_the_repository_needs_settings_before_it_can_answer():
    with pytest.raises(SupabaseNotConfigured):
        run(SupabaseRepository(None).get_job("job"))


def test_the_repository_maps_job_rows_and_defaults_missing_weights():
    row = {"id": "job-1", "status": "open", "requirements": {"must_have": ["SQL"]}, "requirements_version": 2,
           "weights": None}
    rest, _ = client_with(lambda _: httpx.Response(200, json=[row]))

    job = run(SupabaseRepository(rest).get_job("job-1"))

    assert job is not None
    assert job.requirements == JobRequirements(must_have=["SQL"])
    assert job.weights == Weights()


def test_the_repository_reports_roles_and_ignores_unknown_ones():
    rest, _ = client_with(lambda _: httpx.Response(200, json=[{"role": "admin"}]))
    assert run(SupabaseRepository(rest).role_of("user")) is None

    rest, _ = client_with(lambda _: httpx.Response(200, json=[{"role": "hr"}]))
    assert run(SupabaseRepository(rest).role_of("user")) == "hr"


def test_the_repository_writes_the_rows_the_schema_expects():
    rest, recorder = client_with(lambda _: httpx.Response(201))
    repo = SupabaseRepository(rest)
    result = ScoreResult(total=80.0, band="strong", categories=[], requirements=[], knockouts=["Go"], flags=[])

    run(repo.create_application(NewApplication("app-1", "job-1", "user-1", "user-1/app-1.pdf", "a" * 64, "pdf", None)))
    run(repo.save_score("app-1", result, "1", 3))

    application, score = (json.loads(r.content) for r in recorder.requests)
    assert application["resume_path"] == "user-1/app-1.pdf" and application["cover_note"] is None
    assert score["total"] == 80.0 and score["band"] == "strong"
    assert score["breakdown"]["knockouts"] == ["Go"] and "total" not in score["breakdown"]
    assert score["requirements_version"] == 3


def test_the_repository_round_trips_applications_and_extractions():
    candidate = a_candidate()
    rows = {
        "/rest/v1/applications": [{"id": "app-1", "job_id": "job-1", "candidate_id": "user-1",
                                   "resume_path": "user-1/app-1.pdf", "source_type": "pdf"}],
        "/rest/v1/extractions": [{"record": candidate.model_dump(), "experience_months": 24,
                                  "warnings": ["No LinkedIn profile"], "invalid_fields": [], "source_text": None}],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET" and request.url.path.startswith("/storage/"):
            return httpx.Response(200, content=b"%PDF-")
        if request.method == "GET":
            return httpx.Response(200, json=rows.get(request.url.path, []))
        return httpx.Response(204)

    rest, recorder = client_with(handler)
    repo = SupabaseRepository(rest)

    application = run(repo.get_application("app-1"))
    extraction = run(repo.get_extraction("app-1"))

    assert application is not None and application.resume_path == "user-1/app-1.pdf"
    assert run(repo.has_applied("job-1", "user-1")) is True
    assert run(repo.list_application_ids("job-1")) == ["app-1"]
    assert extraction is not None and extraction.candidate == candidate and extraction.experience_months == 24
    assert run(SupabaseRepository(client_with(lambda _: httpx.Response(200, json=[]))[0]).get_application("x")) is None

    run(repo.save_extraction("app-1", extraction, "2"))
    run(repo.set_processing("app-1", "failed", "Not a resume"))
    run(repo.save_requirements("job-1", JobRequirements(must_have=["SQL"]), Weights(), 4))
    run(repo.store_resume("user-1/app-1.pdf", b"%PDF-", "application/pdf"))
    assert run(repo.load_resume("user-1/app-1.pdf")) == b"%PDF-"
    run(repo.delete_resume("user-1/app-1.pdf"))

    writes = [r for r in recorder.requests if r.method in ("POST", "PATCH")]
    # The fourth write is the file upload, whose body is the resume rather than JSON.
    saved_extraction, processing, requirements = (json.loads(r.content) for r in writes[:3])
    assert saved_extraction["prompt_version"] == "2" and saved_extraction["record"]["full_name"] == "Asha Verma"
    assert processing == {"processing_status": "failed", "processing_error": "Not a resume"}
    assert requirements["requirements_version"] == 4 and requirements["requirements"]["must_have"] == ["SQL"]
    assert "neq.withdrawn" in str(recorder.requests[3].url)

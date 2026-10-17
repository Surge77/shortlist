import json
from collections.abc import Callable

import httpx
import pytest

from app.demo.accounts import SupabaseDemoAccounts
from app.demo.store import SupabaseDemoStore
from app.repository import SavedResume
from tests.test_supabase_rest import client_with, run

J1 = "10000000-0000-4000-8000-000000000001"
J2 = "10000000-0000-4000-8000-000000000002"
A1 = "20000000-0000-4000-8000-000000000001"
A2 = "20000000-0000-4000-8000-000000000002"


Reply = httpx.Response | Callable[[httpx.Request], httpx.Response]


def routed(routes: dict[tuple[str, str], Reply]):
    """Answers each request from the first (method, path prefix) that matches."""
    def handler(request: httpx.Request) -> httpx.Response:
        for (method, prefix), response in routes.items():
            if request.method == method and request.url.path.startswith(prefix):
                return response(request) if callable(response) else response
        return httpx.Response(204)
    return handler


def test_demo_sign_in_creates_the_account_sets_the_role_then_returns_the_token():
    rest, recorder = client_with(routed({
        ("POST", "/auth/v1/admin/users"): httpx.Response(422, json={"error_code": "email_exists"}),
        ("POST", "/auth/v1/admin/generate_link"): httpx.Response(200, json={"id": "u1", "hashed_token": "h1"}),
    }))

    token = run(SupabaseDemoAccounts(rest).sign_in_token("hr.demo@example.com", "Hr Demo", "hr"))

    assert token == "h1"
    update = recorder.requests[-1]
    assert (update.method, update.url.path, update.url.params["id"]) == ("PATCH", "/rest/v1/profiles", "eq.u1")
    assert json.loads(update.content) == {"role": "hr"}


def test_bulk_writes_go_out_as_one_upsert_each():
    rest, recorder = client_with(routed({}))
    store = SupabaseDemoStore(rest)

    run(store.upsert_jobs([{"id": "j1"}, {"id": "j2"}]))
    run(store.upsert_applications([{"id": "a1"}]))
    run(store.upsert_profiles([{"id": "u1", "role": "hr"}]))

    assert [r.url.path for r in recorder.requests] == ["/rest/v1/jobs", "/rest/v1/applications", "/rest/v1/profiles"]
    assert all("merge-duplicates" in r.headers["Prefer"] for r in recorder.requests)
    assert json.loads(recorder.requests[0].content) == [{"id": "j1"}, {"id": "j2"}]


def test_deletes_skip_the_call_when_there_is_nothing_to_delete():
    rest, recorder = client_with(routed({}))
    store = SupabaseDemoStore(rest)

    run(store.delete_applications([]))
    run(store.delete_jobs([]))
    run(store.remove_files([]))
    assert recorder.requests == []

    run(store.delete_jobs([J1, J2]))
    assert recorder.requests[0].url.params["id"] == f"in.({J1},{J2})"


def test_filter_ids_must_be_uuids():
    rest, recorder = client_with(routed({}))

    with pytest.raises(ValueError):
        run(SupabaseDemoStore(rest).delete_jobs(["1),id.not.is.null"]))
    assert recorder.requests == []


def test_history_is_replaced_for_the_seeded_applications_only():
    rest, recorder = client_with(routed({}))

    run(SupabaseDemoStore(rest).replace_history([A1, A2], [{"application_id": A1}], []))

    calls = [(r.method, r.url.path) for r in recorder.requests]
    assert calls == [("DELETE", "/rest/v1/stage_events"), ("DELETE", "/rest/v1/notes"), ("POST", "/rest/v1/stage_events")]
    assert recorder.requests[0].url.params["application_id"] == f"in.({A1},{A2})"


def test_reads_map_rows_to_the_values_the_restore_needs():
    rest, _ = client_with(routed({
        ("GET", "/rest/v1/applications"): lambda r: httpx.Response(200, json=(
            [{"id": "a1", "resume_path": "u/a1.pdf"}] if "resume_path" in r.url.params["select"] else [
                {"id": "a1", "processing_status": "scored", "scores": {"requirements_version": 1}},
                {"id": "a2", "processing_status": "scored", "scores": [{"requirements_version": 2}]},
                {"id": "a3", "processing_status": "failed", "scores": []},
            ])),
        ("GET", "/rest/v1/jobs"): httpx.Response(200, json=[{"id": "j1"}]),
        ("GET", "/rest/v1/profiles"): httpx.Response(200, json=[{"id": "u1", "resume_path": "u1/profile-demo.pdf"}]),
        ("GET", "/auth/v1/admin/users"): httpx.Response(200, json={"users": [{"id": "u1", "email": "a@example.com"}]}),
    }))
    store = SupabaseDemoStore(rest)

    assert [(a.id, a.resume_path) for a in run(store.list_applications())] == [("a1", "u/a1.pdf")]
    assert run(store.list_job_ids()) == ["j1"]
    assert run(store.saved_resume_paths([A1])) == {"u1": "u1/profile-demo.pdf"}
    assert run(store.saved_resume_paths([])) == {}
    assert run(store.needing_score([A1, A2, "30000000-0000-4000-8000-000000000003"], 1)) == ["a2", "a3"]
    assert [u.email for u in run(store.list_users())] == ["a@example.com"]


def test_saved_resume_files_are_uploaded_replacing_and_the_profile_points_at_them():
    rest, recorder = client_with(routed({}))
    store = SupabaseDemoStore(rest)

    run(store.upload_pdf("u1/profile-demo.pdf", b"%PDF"))
    run(store.set_saved_resume("u1", SavedResume(path="u1/profile-demo.pdf", source_type="pdf", filename="cv.pdf")))
    run(store.set_saved_resume("u1", None))
    run(store.create_account("a@example.com", "A"))
    run(store.delete_account("u9"))

    upload, saved, cleared, created, deleted = recorder.requests
    assert upload.headers["x-upsert"] == "true"
    assert json.loads(saved.content)["resume_path"] == "u1/profile-demo.pdf"
    assert json.loads(saved.content)["resume_updated_at"]
    assert json.loads(cleared.content) == {"resume_path": None, "resume_source_type": None, "resume_filename": None,
                                           "resume_updated_at": None}
    assert (created.url.path, deleted.url.path) == ("/auth/v1/admin/users", "/auth/v1/admin/users/u9")

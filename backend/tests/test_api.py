import asyncio

import pytest
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.documents import MAX_UPLOAD_BYTES
from app.gemini import GeminiRateLimited, GeminiUnavailable
from app.main import SinglePageApp
from tests.factories import a_candidate, a_job, docx_bytes
from tests.test_documents import PDF, PNG


def test_health_reports_ok(client):
    assert client.get("/api/health").json() == {"ok": True}


def test_health_answers_head_requests_as_uptime_monitors_send(client):
    response = client.head("/api/health")

    assert response.status_code == 200


def test_pasted_text_is_sent_inside_resume_tags(client, fake_generator):
    fake_generator.replies.append(a_candidate())

    response = client.post("/api/extract", data={"text": "Asha Verma, Data Analyst"})

    assert response.status_code == 200
    assert "<resume>\nAsha Verma, Data Analyst\n</resume>" in fake_generator.sent_text()
    body = response.json()
    assert body["source_type"] == "text"
    assert body["source_text"] == "Asha Verma, Data Analyst"
    assert body["candidate"]["full_name"] == "Asha Verma"


def test_a_pdf_is_attached_as_a_file_not_text(client, fake_generator):
    fake_generator.replies.append(a_candidate())

    response = client.post("/api/extract", files={"file": ("resume.pdf", PDF, "application/pdf")})

    assert response.status_code == 200
    assert [blob.mime_type for blob in fake_generator.sent_files()] == ["application/pdf"]
    assert response.json()["source_text"] is None


def test_an_image_is_attached_as_a_file(client, fake_generator):
    fake_generator.replies.append(a_candidate())

    response = client.post("/api/extract", files={"file": ("scan.png", PNG, "image/png")})

    assert response.json()["source_type"] == "image"
    assert fake_generator.sent_files()[0].mime_type == "image/png"


def test_a_word_file_is_converted_to_text_and_returned_for_preview(client, fake_generator):
    fake_generator.replies.append(a_candidate())
    data = docx_bytes(["Asha Verma", "Data Analyst"])

    response = client.post("/api/extract", files={"file": ("cv.docx", data, "application/octet-stream")})

    assert response.json()["source_type"] == "docx"
    assert "Asha Verma" in fake_generator.sent_text()
    assert "Asha Verma" in response.json()["source_text"]


def test_experience_total_and_warnings_are_computed_by_the_server(client, fake_generator):
    candidate = a_candidate(experience=[a_job("2020-01", "2020-12")], contact={"phone": None})
    fake_generator.replies.append(candidate)

    body = client.post("/api/extract", data={"text": "resume"}).json()

    assert body["experience_months"] == 12
    assert "No phone number" in body["warnings"]


def test_a_document_that_is_not_a_resume_comes_back_without_warnings(client, fake_generator):
    fake_generator.replies.append(a_candidate(is_resume=False))

    body = client.post("/api/extract", data={"text": "A recipe for banana bread"}).json()

    assert body["candidate"]["is_resume"] is False
    assert body["warnings"] == []


@pytest.mark.parametrize(
    "kwargs",
    [
        {},
        {"data": {"text": "resume"}, "files": {"file": ("resume.pdf", PDF, "application/pdf")}},
        {"data": {"text": "   "}},
    ],
    ids=["neither", "both", "blank-text"],
)
def test_exactly_one_input_is_required(client, fake_generator, kwargs):
    response = client.post("/api/extract", **kwargs)

    assert response.status_code == 422
    assert isinstance(response.json()["detail"], str)
    assert fake_generator.calls == []


def test_an_unsupported_file_gets_415_with_a_readable_message(client, fake_generator):
    response = client.post("/api/extract", files={"file": ("resume.pdf", b"MZ\x90\x00", "application/pdf")})

    assert response.status_code == 415
    assert "PDF" in response.json()["detail"]
    assert fake_generator.calls == []


def test_an_oversized_body_is_refused_before_it_is_read(client, fake_generator):
    big = PDF + b"0" * (MAX_UPLOAD_BYTES + 200_000)

    response = client.post("/api/extract", files={"file": ("resume.pdf", big, "application/pdf")})

    assert response.status_code == 413
    assert fake_generator.calls == []


def test_a_chunked_upload_without_a_length_is_cut_off_at_the_limit(client, fake_generator):
    crlf = bytes([13, 10])

    def body():
        yield b"--b" + crlf + b'Content-Disposition: form-data; name="file"; filename="r.pdf"' + crlf + crlf + b"%PDF-1.7"
        for _ in range(8):
            yield b"0" * (1024 * 1024)
        yield crlf + b"--b--" + crlf

    response = client.post(
        "/api/extract", content=body(), headers={"content-type": "multipart/form-data; boundary=b"}
    )

    assert response.status_code == 413
    assert fake_generator.calls == []


def test_requests_for_another_host_name_are_refused(client):
    response = client.get("/api/health", headers={"host": "evil.example"})

    assert response.status_code == 400


@pytest.mark.parametrize("error, status", [(GeminiRateLimited(), 429), (GeminiUnavailable(), 502)])
def test_gemini_failures_become_clean_http_errors(client, fake_generator, error, status):
    fake_generator.replies.append(error)

    response = client.post("/api/extract", data={"text": "resume"})

    assert response.status_code == status
    assert response.json() == {"detail": error.user_message}


def test_deep_links_fall_back_to_the_frontend(tmp_path):
    (tmp_path / "index.html").write_text("<div id=root></div>", encoding="utf-8")
    spa = SinglePageApp(directory=tmp_path, html=True)
    scope = {"type": "http", "method": "GET", "headers": [], "path": "/hr/jobs/1"}

    response = asyncio.run(spa.get_response("hr/jobs/1", scope))
    assert response.status_code == 200

    with pytest.raises(StarletteHTTPException):
        asyncio.run(spa.get_response("api/unknown", scope))

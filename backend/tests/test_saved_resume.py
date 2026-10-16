import hashlib

import pytest

from app.requirements import JobRequirements
from app.routes.profile import clean_filename
from tests.factories import docx_bytes
from tests.fakes import ALICE_ID, ALICE_TOKEN, BOB_TOKEN, OPEN_JOB_ID, auth
from tests.test_applications_api import queue_gemini
from tests.test_documents import PDF, PNG

REQUIREMENTS = JobRequirements(must_have=["SQL", "Kubernetes"], min_years=1)


@pytest.fixture
def open_job(fake_repo):
    return fake_repo.add_job(OPEN_JOB_ID, requirements=REQUIREMENTS)


def save(client, *, token=ALICE_TOKEN, data=PDF, name="Alice CV.pdf"):
    return client.put("/api/me/resume", files={"file": (name, data, "application/pdf")}, headers=auth(token))


def quick_apply(client, *, token=ALICE_TOKEN, note=None):
    form = {"use_saved_resume": "true", **({"cover_note": note} if note else {})}
    return client.post(f"/api/jobs/{OPEN_JOB_ID}/applications", data=form, headers=auth(token))


def test_saving_a_resume_stores_the_file_in_the_candidates_folder(client, fake_repo):
    response = save(client)

    assert response.status_code == 200
    assert response.json() == {"filename": "Alice CV.pdf", "source_type": "pdf"}
    saved = fake_repo.saved_resumes[ALICE_ID]
    assert saved.path.startswith(f"{ALICE_ID}/profile-") and saved.path.endswith(".pdf")
    assert fake_repo.files[saved.path] == (PDF, "application/pdf")


def test_replacing_the_saved_resume_removes_the_old_file(client, fake_repo):
    save(client)
    first = fake_repo.saved_resumes[ALICE_ID].path

    save(client, data=PNG, name="scan.png")

    second = fake_repo.saved_resumes[ALICE_ID]
    assert (second.source_type, second.filename) == ("image", "scan.png")
    assert first not in fake_repo.files and second.path in fake_repo.files


def test_the_stored_file_name_is_reduced_to_a_plain_name(client, fake_repo):
    save(client, name="../..\\evil name.pdf")

    assert fake_repo.saved_resumes[ALICE_ID].filename == "evil name.pdf"


@pytest.mark.parametrize(("raw", "clean"), [("a\x00b\x1f.pdf", "ab.pdf"), ("C:\\x\\cv.pdf", "cv.pdf"), ("", "resume"),
                                            ("/", "resume"), ("n" * 300, "n" * 200)])
def test_file_names_lose_folders_and_control_characters(raw, clean):
    assert clean_filename(raw) == clean


def test_a_file_that_is_not_a_resume_type_is_refused_and_nothing_is_stored(client, fake_repo):
    response = save(client, data=b"MZ\x90\x00 not a document", name="tool.exe")

    assert response.status_code == 415
    assert fake_repo.files == {} and fake_repo.saved_resumes == {}


def test_hr_accounts_have_no_saved_resume(client):
    assert client.put("/api/me/resume", files={"file": ("cv.pdf", PDF, "application/pdf")}).status_code == 403


def test_removing_the_saved_resume_deletes_the_file(client, fake_repo):
    save(client)
    path = fake_repo.saved_resumes[ALICE_ID].path

    response = client.delete("/api/me/resume", headers=auth(ALICE_TOKEN))

    assert response.status_code == 204
    assert ALICE_ID not in fake_repo.saved_resumes and path not in fake_repo.files


def test_quick_apply_copies_the_saved_resume_into_the_application(client, fake_repo, fake_generator, open_job):
    save(client, data=docx_bytes(["Alice Example", "SQL"]), name="cv.docx")
    saved = fake_repo.saved_resumes[ALICE_ID]
    queue_gemini(fake_generator)

    response = quick_apply(client, note="Keen.")

    assert response.status_code == 201
    application = fake_repo.applications[response.json()["id"]]
    assert application.resume_path == f"{ALICE_ID}/{application.id}.docx"
    assert application.resume_path != saved.path
    assert fake_repo.files[application.resume_path][0] == fake_repo.files[saved.path][0]
    assert application.resume_sha256 == hashlib.sha256(fake_repo.files[saved.path][0]).hexdigest()
    assert application.cover_note == "Keen."
    assert fake_repo.processing[application.id] == ("scored", None)


def test_quick_apply_without_a_saved_resume_explains_what_to_do(client, open_job):
    response = quick_apply(client, token=BOB_TOKEN)

    assert response.status_code == 404
    assert "saved resume" in response.json()["detail"]


def test_applying_with_both_a_file_and_the_saved_resume_is_refused(client, open_job):
    response = client.post(f"/api/jobs/{OPEN_JOB_ID}/applications", data={"use_saved_resume": "true"},
                           files={"file": ("cv.pdf", PDF, "application/pdf")}, headers=auth(ALICE_TOKEN))

    assert response.status_code == 422


def test_applying_with_no_resume_at_all_is_refused(client, open_job):
    response = client.post(f"/api/jobs/{OPEN_JOB_ID}/applications", data={"cover_note": "hi"},
                           headers=auth(ALICE_TOKEN))

    assert response.status_code == 422


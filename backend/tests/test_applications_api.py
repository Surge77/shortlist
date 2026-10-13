import hashlib

import pytest

from app.matching import MatchReply, MatchVerdict
from app.requirements import JobRequirements
from tests.factories import a_candidate, docx_bytes
from tests.fakes import ALICE_ID, ALICE_TOKEN, BOB_TOKEN, DRAFT_JOB_ID, OPEN_JOB_ID, auth
from tests.test_documents import PDF, PNG

REQUIREMENTS = JobRequirements(must_have=["SQL", "Kubernetes"], min_years=1)


@pytest.fixture
def open_job(fake_repo):
    return fake_repo.add_job(OPEN_JOB_ID, requirements=REQUIREMENTS, version=3)


def apply(client, *, token=ALICE_TOKEN, job_id=OPEN_JOB_ID, data=PDF, name="resume.pdf", note=None):
    form = {"cover_note": note} if note is not None else None
    return client.post(f"/api/jobs/{job_id}/applications", files={"file": (name, data, "application/pdf")},
                       data=form, headers=auth(token))


def queue_gemini(fake_generator, *, candidate=None):
    fake_generator.replies.append(candidate or a_candidate())
    fake_generator.replies.append(MatchReply(verdicts=[
        MatchVerdict(requirement_id="must-1", verdict="met", evidence="SQL"),
        MatchVerdict(requirement_id="must-2", verdict="missing", evidence=None),
    ]))


def test_applying_stores_the_file_and_scores_it_in_the_background(client, fake_repo, fake_generator, open_job):
    queue_gemini(fake_generator)

    response = apply(client, note="  Keen to join.  ")

    assert response.status_code == 201
    app_id = response.json()["id"]
    application = fake_repo.applications[app_id]
    assert application.candidate_id == ALICE_ID
    assert application.resume_path == f"{ALICE_ID}/{app_id}.pdf"
    assert application.resume_sha256 == hashlib.sha256(PDF).hexdigest()
    assert application.cover_note == "Keen to join."
    assert fake_repo.files[application.resume_path] == (PDF, "application/pdf")
    # TestClient runs background tasks before returning, so processing has finished.
    assert fake_repo.processing[app_id] == ("scored", None)
    saved = fake_repo.scores[app_id]
    assert saved.requirements_version == 3
    assert saved.result.knockouts == ["Kubernetes"]
    assert saved.result.total is not None


def test_word_and_image_resumes_keep_their_type_in_the_path(client, fake_repo, fake_generator, open_job):
    queue_gemini(fake_generator)
    word = apply(client, data=docx_bytes(["Asha Verma", "SQL"]), name="cv.docx").json()["id"]
    queue_gemini(fake_generator)
    image = apply(client, token=BOB_TOKEN, data=PNG, name="scan.png").json()["id"]

    assert fake_repo.applications[word].resume_path.endswith(".docx")
    assert fake_repo.applications[word].source_type == "docx"
    assert fake_repo.applications[image].resume_path.endswith(".png")


def test_hr_cannot_apply(client, open_job):
    assert apply(client, token="hr-token").status_code == 403


def test_signed_out_visitors_cannot_apply(client, open_job):
    response = client.post(f"/api/jobs/{OPEN_JOB_ID}/applications", files={"file": ("r.pdf", PDF)},
                           headers={"Authorization": ""})
    assert response.status_code == 401


@pytest.mark.parametrize("status", ["draft", "closed"])
def test_only_open_jobs_take_applications(client, fake_repo, status):
    fake_repo.add_job(DRAFT_JOB_ID, status=status, requirements=REQUIREMENTS)

    response = apply(client, job_id=DRAFT_JOB_ID)

    assert response.status_code == 404
    assert response.json() == {"detail": "This job isn't open for applications."}


def test_an_unknown_job_is_not_open(client):
    assert apply(client, job_id="10000000-0000-4000-8000-00000000ffff").status_code == 404


def test_one_application_per_job(client, fake_generator, open_job):
    queue_gemini(fake_generator)
    apply(client)

    response = apply(client)

    assert response.status_code == 409
    assert response.json() == {"detail": "You've already applied to this job."}


def test_losing_the_duplicate_race_removes_the_uploaded_file(client, fake_repo, open_job):
    fake_repo.fail_inserts_as_duplicate = True

    response = apply(client)

    assert response.status_code == 409
    assert fake_repo.files == {}


def test_bad_files_are_refused_before_anything_is_stored(client, fake_repo, open_job):
    response = apply(client, data=b"MZ\x90\x00 not a resume", name="tool.exe")

    assert response.status_code == 415
    assert fake_repo.files == {} and fake_repo.applications == {}


def test_long_cover_notes_are_refused(client, fake_repo, open_job):
    response = apply(client, note="x" * 2001)

    assert response.status_code == 413
    assert fake_repo.files == {}


def test_a_document_that_is_not_a_resume_fails_with_a_reason(client, fake_repo, fake_generator, open_job):
    fake_generator.replies.append(a_candidate(is_resume=False))

    app_id = apply(client).json()["id"]

    assert fake_repo.processing[app_id] == ("failed", "This file doesn't look like a resume.")
    assert app_id not in fake_repo.scores


def test_hr_can_rescore_an_application(client, fake_repo, fake_generator, open_job):
    queue_gemini(fake_generator)
    app_id = apply(client).json()["id"]
    fake_generator.replies.append(MatchReply(verdicts=[
        MatchVerdict(requirement_id="must-1", verdict="met", evidence="SQL"),
        MatchVerdict(requirement_id="must-2", verdict="met", evidence="Python"),
    ]))

    response = client.post(f"/api/applications/{app_id}/rescore")

    assert response.status_code == 202
    assert fake_repo.scores[app_id].result.knockouts == []
    assert len(fake_generator.calls) == 3  # extract, match, then only a second match


def test_candidates_cannot_rescore(client, fake_generator, open_job):
    queue_gemini(fake_generator)
    app_id = apply(client).json()["id"]

    assert client.post(f"/api/applications/{app_id}/rescore", headers=auth(ALICE_TOKEN)).status_code == 403


def test_rescoring_an_unknown_application_is_404(client):
    assert client.post("/api/applications/20000000-0000-4000-8000-00000000ffff/rescore").status_code == 404

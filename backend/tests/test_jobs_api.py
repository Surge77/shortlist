from app.matching import MatchReply, MatchVerdict
from app.requirements import JobRequirements, RequirementsDraft
from tests.factories import a_candidate
from tests.fakes import ALICE_TOKEN, OPEN_JOB_ID, auth
from tests.test_applications_api import apply, queue_gemini

DESCRIPTION = "We are hiring a data engineer with Python and SQL, three years of experience."


def test_hr_drafts_requirements_from_a_description(client, fake_generator):
    fake_generator.replies.append(RequirementsDraft(must_have=["Python", "SQL"], nice_to_have=[], min_years=3,
                                                    education_level=None, education_fields=[], certifications=[]))

    response = client.post("/api/requirements/draft", json={"description": DESCRIPTION})

    assert response.status_code == 200
    assert response.json()["must_have"] == ["Python", "SQL"]
    assert response.json()["min_years"] == 3


def test_a_too_short_description_is_refused_without_calling_gemini(client, fake_generator):
    response = client.post("/api/requirements/draft", json={"description": "short"})

    assert response.status_code == 422
    assert fake_generator.calls == []


def test_saving_requirements_bumps_the_version(client, fake_repo):
    fake_repo.add_job(OPEN_JOB_ID, requirements=None, version=0)
    body = {"requirements": {"must_have": ["Python", "python"], "min_years": 2}, "weights": {"experience": 40}}

    response = client.put(f"/api/jobs/{OPEN_JOB_ID}/requirements", json=body)

    assert response.json() == {"requirements_version": 1}
    job = fake_repo.jobs[OPEN_JOB_ID]
    assert job.requirements == JobRequirements(must_have=["Python"], min_years=2)
    assert job.weights.experience == 40 and job.weights.must_have == 50


def test_invalid_requirements_are_refused(client, fake_repo):
    fake_repo.add_job(OPEN_JOB_ID, requirements=None, version=0)
    zero_weights = {"must_have": 0, "nice_to_have": 0, "experience": 0, "education": 0, "certifications": 0}

    response = client.put(f"/api/jobs/{OPEN_JOB_ID}/requirements",
                          json={"requirements": {"must_have": ["SQL"]}, "weights": zero_weights})

    assert response.status_code == 422
    assert fake_repo.jobs[OPEN_JOB_ID].requirements_version == 0


def test_saving_requirements_for_an_unknown_job_is_404(client):
    response = client.put(f"/api/jobs/{OPEN_JOB_ID}/requirements", json={"requirements": {}})

    assert response.status_code == 404


def test_candidates_cannot_draft_or_save_requirements(client, fake_repo):
    fake_repo.add_job(OPEN_JOB_ID)
    assert client.post("/api/requirements/draft", json={"description": DESCRIPTION},
                       headers=auth(ALICE_TOKEN)).status_code == 403
    assert client.put(f"/api/jobs/{OPEN_JOB_ID}/requirements", json={"requirements": {}},
                      headers=auth(ALICE_TOKEN)).status_code == 403


def test_rescoring_a_job_scores_every_application_against_the_new_version(client, fake_repo, fake_generator):
    fake_repo.add_job(OPEN_JOB_ID, requirements=JobRequirements(must_have=["SQL", "Kubernetes"]), version=1)
    queue_gemini(fake_generator)
    app_id = apply(client).json()["id"]
    client.put(f"/api/jobs/{OPEN_JOB_ID}/requirements", json={"requirements": {"must_have": ["SQL"]}})
    fake_generator.replies.append(MatchReply(verdicts=[MatchVerdict(requirement_id="must-1", verdict="met",
                                                                    evidence="SQL")]))

    response = client.post(f"/api/jobs/{OPEN_JOB_ID}/rescore")

    assert response.status_code == 202
    assert response.json() == {"requirements_version": 2, "queued": 1}
    assert fake_repo.scores[app_id].requirements_version == 2
    assert fake_repo.scores[app_id].result.total == 100.0


def test_rescoring_an_unknown_job_is_404(client):
    assert client.post(f"/api/jobs/{OPEN_JOB_ID}/rescore").status_code == 404


def test_extract_still_works_for_hr(client, fake_generator):
    fake_generator.replies.append(a_candidate())

    assert client.post("/api/extract", data={"text": "Asha Verma"}).status_code == 200

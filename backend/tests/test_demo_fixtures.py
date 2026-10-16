from dataclasses import replace

import pytest

from app.demo.fixtures import DemoApplication, check, demo_id, load_fixtures


@pytest.fixture
def data():
    return load_fixtures()


def test_the_demo_has_open_jobs_across_many_departments_and_one_draft(data):
    open_jobs = [job for job in data.jobs if job.status == "open"]
    assert len(open_jobs) >= 15
    assert len({job.department for job in open_jobs}) >= 10
    assert [job.slug for job in data.jobs if job.status == "draft"] == ["data-scientist"]
    assert {job.employment_type for job in open_jobs} == {"full_time", "part_time", "contract", "internship"}


def test_every_open_job_has_applicants_and_every_stage_appears(data):
    applied = {application.job for application in data.applications}
    assert applied == {job.slug for job in data.jobs if job.status == "open"}
    assert {application.stage for application in data.applications} == {
        "submitted", "reviewing", "shortlisted", "rejected", "hired", "withdrawn"}


def test_only_the_live_demo_candidate_starts_with_a_saved_resume(data):
    assert [c.slug for c in data.candidates if c.has_saved_resume] == ["riya"]


def test_ids_are_stable_and_distinct(data):
    assert data.job("data-analyst").id == demo_id("job", "data-analyst")
    ids = [job.id for job in data.jobs] + [a.id for a in data.applications]
    assert len(set(ids)) == len(ids)


def test_all_demo_people_use_the_reserved_example_domain(data):
    assert all(c.email.endswith("@example.com") for c in data.candidates)
    assert data.hr_email.endswith("@example.com")


def with_application(data, **changes):
    first = data.applications[0]
    return replace(data, applications=(replace(first, **changes), *data.applications[1:]))


@pytest.mark.parametrize("changes", [
    {"job": "no-such-job"},
    {"candidate": "nobody"},
    {"job": "data-scientist"},
    {"stages": ("submitted",)},
    {"stages": ("reviewing", "withdrawn")},
    {"stages": ("promoted",)},
])
def test_fixture_mistakes_are_caught(data, changes):
    with pytest.raises(ValueError):
        check(with_application(data, **changes))


def test_a_duplicate_application_is_caught(data):
    duplicate = DemoApplication(id="x", candidate=data.applications[0].candidate, job=data.applications[0].job,
                                days_ago=1, stages=(), cover_note=None, notes=())
    with pytest.raises(ValueError):
        check(replace(data, applications=(*data.applications, duplicate)))


def test_an_open_job_without_requirements_is_caught(data):
    broken = replace(data.jobs[0], requirements=None)
    with pytest.raises(ValueError):
        check(replace(data, jobs=(broken, *data.jobs[1:])))

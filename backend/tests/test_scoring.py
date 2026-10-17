import pytest

from app.matching import CheckedVerdict, ChecklistItem, Verdict
from app.requirements import JobRequirements, Weights
from app.schemas import Education
from app.scoring import (
    band_for,
    compute_score,
    degree_level,
    experience_credit,
    highest_level,
    level_credit,
)


def verdict(item_id: str, category, text: str, value: Verdict, *, unverified: bool = False) -> CheckedVerdict:
    evidence = None if value == "missing" else text
    return CheckedVerdict(ChecklistItem(item_id, category, text), value, evidence, unverified)


def degree(name: str | None) -> Education:
    return Education(institution="Example University", degree=name, field=None, start=None, end=None, grade=None)


@pytest.mark.parametrize(
    ("text", "level"),
    [
        ("B.Sc.", "bachelor"),
        ("B.Tech in Computer Science", "bachelor"),
        ("Bachelor's degree", "bachelor"),
        ("M.Tech", "master"),
        ("MBA", "master"),
        ("Master of Science", "master"),
        ("Ph.D.", "doctorate"),
        ("Diploma in Electronics", "diploma"),
        ("HSC (12th)", "high_school"),
        ("Certificate course", None),
        (None, None),
    ],
)
def test_degree_text_maps_to_a_level(text, level):
    assert degree_level(text) == level


def test_the_highest_degree_counts():
    assert highest_level([degree("B.E."), degree("M.Sc."), degree(None)]) == "master"
    assert highest_level([]) is None


@pytest.mark.parametrize(
    ("months", "min_years", "credit"),
    [(36, 3, 1.0), (60, 3, 1.0), (18, 3, 0.5), (0, 2, 0.0), (None, 2, 0.0), (24, None, None), (24, 0, None)],
)
def test_experience_credit_ramps_up_to_the_requirement(months, min_years, credit):
    assert experience_credit(months, min_years) == credit


@pytest.mark.parametrize(
    ("candidate", "required", "credit"),
    [("master", "bachelor", 1.0), ("bachelor", "bachelor", 1.0), ("diploma", "bachelor", 0.5),
     ("high_school", "bachelor", 0.0), (None, "bachelor", 0.0), ("master", None, None)],
)
def test_education_level_credit_allows_one_level_short_for_half(candidate, required, credit):
    assert level_credit(candidate, required) == credit


@pytest.mark.parametrize(("total", "band"), [(75.0, "strong"), (74.9, "possible"), (50.0, "possible"), (49.9, "weak")])
def test_bands(total, band):
    assert band_for(total) == band


def test_a_candidate_meeting_everything_scores_100():
    requirements = JobRequirements(must_have=["Python", "SQL"], nice_to_have=["dbt"], min_years=2)
    verdicts = [verdict("must-1", "must_have", "Python", "met"), verdict("must-2", "must_have", "SQL", "met"),
                verdict("nice-1", "nice_to_have", "dbt", "met")]

    result = compute_score(requirements, verdicts, 30, [], Weights())

    assert result.total == 100.0
    assert result.band == "strong"
    assert result.knockouts == []


def test_categories_the_job_does_not_ask_about_drop_out_and_the_rest_share_100_points():
    requirements = JobRequirements(must_have=["Python", "SQL"], min_years=4)
    verdicts = [verdict("must-1", "must_have", "Python", "met"), verdict("must-2", "must_have", "SQL", "partial")]

    result = compute_score(requirements, verdicts, 24, [], Weights())

    # Must-haves 50 and experience 20 are the only weights in play: 50/70 and 20/70 of 100.
    by_category = {c.category: c for c in result.categories}
    assert set(by_category) == {"must_have", "experience"}
    assert by_category["must_have"].max_points == 71.4
    assert by_category["must_have"].points == 53.6  # credit 0.75
    assert by_category["experience"].points == 14.3  # 2 of 4 years
    assert result.total == 67.9
    assert result.band == "possible"
    assert by_category["must_have"].detail == "1 of 2 met, 1 partly"
    assert by_category["experience"].detail == "2 years of 4 years asked for"


def test_every_category_contributes_its_weighted_share():
    requirements = JobRequirements(must_have=["Python"], nice_to_have=["Airflow"], min_years=1,
                                   education_level="bachelor", certifications=["AWS SAA"])
    verdicts = [verdict("must-1", "must_have", "Python", "met"), verdict("nice-1", "nice_to_have", "Airflow", "missing"),
                verdict("cert-1", "certifications", "AWS SAA", "missing")]

    result = compute_score(requirements, verdicts, 12, [degree("B.Sc.")], Weights())

    assert result.total == 80.0  # 50 + 0 + 20 + 10 + 0
    assert sum(c.max_points for c in result.categories) == pytest.approx(100)


def test_education_combines_level_and_field_of_study():
    requirements = JobRequirements(education_level="master", education_fields=["Statistics"])
    verdicts = [verdict("edu-field", "education", "A degree or studies in: Statistics", "met")]

    result = compute_score(requirements, verdicts, None, [degree("B.Sc.")], Weights())

    education = result.categories[0]
    assert education.credit == 0.75  # level one short (0.5) and field met (1.0)
    assert education.detail == "Highest degree bachelor, master asked for; field of study met"


def test_missing_must_haves_are_knockouts_that_inform_but_do_not_zero_the_score():
    requirements = JobRequirements(must_have=["Python", "Kubernetes"])
    verdicts = [verdict("must-1", "must_have", "Python", "met"), verdict("must-2", "must_have", "Kubernetes", "missing")]

    result = compute_score(requirements, verdicts, None, [], Weights())

    assert result.knockouts == ["Kubernetes"]
    assert result.total == 50.0


def test_unverified_evidence_is_flagged():
    requirements = JobRequirements(must_have=["Rust"])
    verdicts = [verdict("must-1", "must_have", "Rust", "missing", unverified=True)]

    result = compute_score(requirements, verdicts, None, [], Weights())

    assert result.total == 0.0
    assert result.flags == ["Evidence for “Rust” is not in the resume, so it counts as missing"]


def test_unknown_experience_scores_zero_and_says_why():
    result = compute_score(JobRequirements(min_years=3), [], None, [], Weights())

    assert result.total == 0.0
    assert "Total experience is unknown" in result.flags[0]
    assert result.categories[0].detail == "unknown of 3 years asked for"


def test_hidden_instructions_are_flagged():
    result = compute_score(JobRequirements(min_years=1), [], 12, [], Weights(), has_hidden_instructions=True)

    assert any("aimed at AI screening" in flag for flag in result.flags)


def test_a_job_with_no_requirements_has_no_score():
    result = compute_score(JobRequirements(), [], 40, [], Weights())

    assert result.total is None
    assert result.band is None
    assert result.flags == ["The job has no requirements to score against"]


def test_a_zero_weight_category_is_left_out():
    requirements = JobRequirements(must_have=["Python"], min_years=5)
    verdicts = [verdict("must-1", "must_have", "Python", "met")]

    result = compute_score(requirements, verdicts, 0, [], Weights(experience=0))

    assert [c.category for c in result.categories] == ["must_have"]
    assert result.total == 100.0

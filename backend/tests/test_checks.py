import pytest

from app.checks import find_problems, is_valid_email, is_valid_phone
from tests.factories import a_candidate, a_job


@pytest.mark.parametrize("email", ["asha.verma@example.com", "a+jobs@mail.co.in"])
def test_well_formed_emails_pass(email):
    assert is_valid_email(email)


@pytest.mark.parametrize(
    "email",
    ["asha.verma@", "asha verma@example.com", "example.com", "a@b", "a@b.com?bcc=x%40evil.com", "a@b.com#x"],
)
def test_malformed_emails_fail(email):
    assert not is_valid_email(email)


@pytest.mark.parametrize("phone", ["+91 98765 43210", "(020) 2612-3456", "9876543210"])
def test_plausible_phone_numbers_pass(phone):
    assert is_valid_phone(phone)


@pytest.mark.parametrize("phone", ["12345", "call me maybe", "+91 98765 43210 12345 6789"])
def test_implausible_phone_numbers_fail(phone):
    assert not is_valid_phone(phone)


def test_a_complete_resume_has_no_problems():
    warnings, invalid = find_problems(a_candidate(), experience_months=24)

    assert warnings == []
    assert invalid == []


def test_missing_contact_details_are_listed_for_hr():
    candidate = a_candidate(contact={"email": None, "phone": None, "linkedin": None})

    warnings, _ = find_problems(candidate, experience_months=24)

    assert "No email address" in warnings
    assert "No phone number" in warnings
    assert "No LinkedIn profile" in warnings


def test_a_malformed_email_is_flagged_as_invalid():
    candidate = a_candidate(contact={"email": "asha.verma@"})

    warnings, invalid = find_problems(candidate, experience_months=24)

    assert invalid == ["email"]
    assert "Email address looks malformed" in warnings


def test_experience_without_dates_is_called_out():
    candidate = a_candidate(experience=[a_job(None, None)])

    warnings, _ = find_problems(candidate, experience_months=None)

    assert "Work experience has no usable dates, so total experience is unknown" in warnings


def test_missing_education_is_called_out():
    warnings, _ = find_problems(a_candidate(education=[]), experience_months=24)

    assert "No education listed" in warnings

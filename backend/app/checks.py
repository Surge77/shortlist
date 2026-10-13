"""What HR should double-check: missing details and values that look malformed."""

import re

from app.schemas import Candidate, CheckedField

# ? & # % are refused: in a mailto: link they start parameters, so a "resume email" like
# a@b.com?bcc=attacker@x.com would silently copy someone in on HR's reply.
EMAIL = re.compile(r"^[^@\s?&#%]+@[^@\s?&#%]+\.[A-Za-z]{2,}$")
PHONE_CHARACTERS = re.compile(r"^[\d\s()+\-.]+$")
# E.164 allows at most 15 digits; fewer than 7 is not a reachable number anywhere.
MIN_PHONE_DIGITS = 7
MAX_PHONE_DIGITS = 15


def is_valid_email(value: str) -> bool:
    return EMAIL.match(value.strip()) is not None


def is_valid_phone(value: str) -> bool:
    text = value.strip()
    digits = sum(character.isdigit() for character in text)
    return PHONE_CHARACTERS.match(text) is not None and MIN_PHONE_DIGITS <= digits <= MAX_PHONE_DIGITS


def find_problems(candidate: Candidate, experience_months: int | None) -> tuple[list[str], list[CheckedField]]:
    warnings: list[str] = []
    invalid: list[CheckedField] = []
    contact = candidate.contact

    if not contact.email:
        warnings.append("No email address")
    elif not is_valid_email(contact.email):
        warnings.append("Email address looks malformed")
        invalid.append("email")

    if not contact.phone:
        warnings.append("No phone number")
    elif not is_valid_phone(contact.phone):
        warnings.append("Phone number looks malformed")
        invalid.append("phone")

    if not contact.linkedin:
        warnings.append("No LinkedIn profile")
    if candidate.experience and experience_months is None:
        warnings.append("Work experience has no usable dates, so total experience is unknown")
    if not candidate.education:
        warnings.append("No education listed")
    return warnings, invalid

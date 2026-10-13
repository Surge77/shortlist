"""Total work experience, computed from the dates Gemini extracted.

The model reads dates well and adds them up badly, so the arithmetic lives here.
"""

import re
from datetime import date

from app.schemas import Experience

MONTHS_PER_YEAR = 12
YEAR_MONTH = re.compile(r"^(\d{4})-(\d{2})$")
YEAR_ONLY = re.compile(r"^(\d{4})$")
ONGOING = frozenset({"present", "current", "now", "ongoing", "till date", "to date"})


def parse_month(value: str | None, *, is_end: bool, today: date) -> tuple[int, int] | None:
    if not value:
        return None
    text = value.strip()
    if text.lower() in ONGOING:
        return (today.year, today.month) if is_end else None
    match = YEAR_MONTH.match(text)
    if match:
        year, month = int(match[1]), int(match[2])
        return (year, month) if 1 <= month <= MONTHS_PER_YEAR else None
    match = YEAR_ONLY.match(text)
    if match:
        # A bare year is read generously: from January when it starts a job, through
        # December when it ends one.
        return (int(match[1]), MONTHS_PER_YEAR if is_end else 1)
    return None


def _month_index(year_month: tuple[int, int]) -> int:
    year, month = year_month
    return year * MONTHS_PER_YEAR + (month - 1)


def total_experience_months(experience: list[Experience], today: date) -> int | None:
    intervals: list[tuple[int, int]] = []
    for job in experience:
        start = parse_month(job.start, is_end=False, today=today)
        end = parse_month(job.end, is_end=True, today=today)
        if start is None or end is None or _month_index(end) < _month_index(start):
            continue
        intervals.append((_month_index(start), _month_index(end)))
    if not intervals:
        return None

    # Merge overlaps so two jobs held at once count once. Both ends are inclusive months.
    intervals.sort()
    total = 0
    current_start, current_end = intervals[0]
    for start, end in intervals[1:]:
        if start <= current_end + 1:
            current_end = max(current_end, end)
            continue
        total += current_end - current_start + 1
        current_start, current_end = start, end
    return total + current_end - current_start + 1

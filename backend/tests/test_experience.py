from datetime import date

import pytest

from app.experience import parse_month, total_experience_months
from tests.factories import a_job

TODAY = date(2026, 10, 12)


@pytest.mark.parametrize(
    "value, is_end, expected",
    [
        ("2021-03", False, (2021, 3)),
        ("2021-03", True, (2021, 3)),
        ("2021", False, (2021, 1)),
        ("2021", True, (2021, 12)),
        ("Present", True, (2026, 10)),
        ("current", True, (2026, 10)),
        ("Present", False, None),
        ("2021-13", False, None),
        ("March 2021", False, None),
        (None, True, None),
        ("", True, None),
    ],
)
def test_parse_month_reads_only_the_formats_the_prompt_asks_for(value, is_end, expected):
    assert parse_month(value, is_end=is_end, today=TODAY) == expected


def test_a_single_job_counts_both_its_first_and_last_month():
    jobs = [a_job("2024-01", "2024-12")]

    assert total_experience_months(jobs, TODAY) == 12


def test_a_current_job_runs_up_to_this_month():
    jobs = [a_job("2025-11", "Present")]

    assert total_experience_months(jobs, TODAY) == 12


def test_overlapping_jobs_are_not_counted_twice():
    jobs = [a_job("2020-01", "2020-12"), a_job("2020-07", "2021-06")]

    assert total_experience_months(jobs, TODAY) == 18


def test_a_gap_between_jobs_is_not_counted():
    jobs = [a_job("2019-01", "2019-06"), a_job("2020-01", "2020-06")]

    assert total_experience_months(jobs, TODAY) == 12


def test_jobs_without_usable_dates_are_skipped():
    jobs = [a_job(None, "2020-01"), a_job("2022-05", "2021-01"), a_job("2023-01", "2023-03")]

    assert total_experience_months(jobs, TODAY) == 3


def test_no_usable_dates_means_unknown_not_zero():
    assert total_experience_months([a_job(None, None)], TODAY) is None
    assert total_experience_months([], TODAY) is None

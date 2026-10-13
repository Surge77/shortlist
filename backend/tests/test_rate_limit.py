import pytest

from app.rate_limit import APPLY_LIMIT, GEMINI_HR_LIMIT, RateLimiter, TooManyRequests
from tests.fakes import OPEN_JOB_ID
from tests.test_applications_api import REQUIREMENTS, apply


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def test_calls_past_the_limit_are_refused_until_the_window_moves_on():
    clock = FakeClock()
    limiter = RateLimiter(max_calls=2, window_seconds=60, clock=clock)

    limiter.check("alice")
    limiter.check("alice")
    with pytest.raises(TooManyRequests):
        limiter.check("alice")
    limiter.check("bob")  # each user has their own allowance

    clock.now = 60
    limiter.check("alice")


def test_applying_too_often_returns_429(client, fake_repo, monkeypatch):
    fake_repo.add_job(OPEN_JOB_ID, requirements=REQUIREMENTS)
    monkeypatch.setattr(APPLY_LIMIT, "max_calls", 0)

    response = apply(client)

    assert response.status_code == 429
    assert response.json() == {"detail": TooManyRequests.user_message}
    assert fake_repo.files == {}


def test_hr_drafting_is_limited_too(client, monkeypatch):
    monkeypatch.setattr(GEMINI_HR_LIMIT, "max_calls", 0)

    response = client.post("/api/requirements/draft", json={"description": "x" * 40})

    assert response.status_code == 429


def test_signed_out_callers_get_401_not_429(client, monkeypatch):
    monkeypatch.setattr(APPLY_LIMIT, "max_calls", 0)

    assert client.post(f"/api/jobs/{OPEN_JOB_ID}/applications", files={"file": ("r.pdf", b"%PDF-")},
                       headers={"Authorization": ""}).status_code == 401

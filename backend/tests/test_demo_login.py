from dataclasses import dataclass, field

import pytest

from app.config import DemoSettings
from app.main import app
from app.rate_limit import DEMO_LOGIN_LIMIT
from app.routes.demo import get_demo_accounts, get_demo_settings, name_from_email

HR_EMAIL = "hr.demo@example.com"
CANDIDATE_EMAIL = "riya.demo@example.com"
DEMO = DemoSettings(hr_emails=frozenset({HR_EMAIL}), candidate_email=CANDIDATE_EMAIL)


@dataclass
class FakeDemoAccounts:
    calls: list[tuple[str, str | None, str]] = field(default_factory=list)

    async def sign_in_token(self, email: str, full_name: str | None, role: str) -> str:
        self.calls.append((email, full_name, role))
        return f"hashed-{email}"


@pytest.fixture
def accounts():
    return FakeDemoAccounts()


@pytest.fixture
def demo_on(client, accounts):
    app.dependency_overrides[get_demo_settings] = lambda: DEMO
    app.dependency_overrides[get_demo_accounts] = lambda: accounts
    yield
    DEMO_LOGIN_LIMIT._calls.clear()


@pytest.fixture
def demo_off(client, accounts):
    app.dependency_overrides[get_demo_settings] = lambda: None
    app.dependency_overrides[get_demo_accounts] = lambda: accounts


def login(client, email):
    return client.post("/api/auth/demo-login", json={"email": email}, headers={"Authorization": ""})


def test_options_report_demo_login_and_the_quick_sign_in_emails(client, demo_on):
    response = client.get("/api/auth/options")

    assert response.json() == {"demo": True, "hr_email": HR_EMAIL, "candidate_email": CANDIDATE_EMAIL}


def test_options_without_demo_mode_name_no_accounts(client, demo_off):
    response = client.get("/api/auth/options")

    assert response.json() == {"demo": False, "hr_email": None, "candidate_email": None}


def test_an_allowlisted_email_signs_in_as_hr(client, demo_on, accounts):
    response = login(client, HR_EMAIL)

    assert response.status_code == 200
    assert response.json() == {"token_hash": f"hashed-{HR_EMAIL}"}
    assert accounts.calls == [(HR_EMAIL, "Hr Demo", "hr")]


def test_any_other_email_signs_in_as_a_candidate_after_normalising(client, demo_on, accounts):
    response = login(client, "  Asha.Verma@Example.COM ")

    assert response.status_code == 200
    assert accounts.calls == [("asha.verma@example.com", "Asha Verma", "candidate")]


@pytest.mark.parametrize("email", ["", "no-at-sign", "a@b", "two@@example.com", "spa ce@example.com",
                                   f"{'a' * 250}@example.com"])
def test_a_malformed_email_is_rejected_before_any_account_work(client, demo_on, accounts, email):
    response = login(client, email)

    assert response.status_code == 422
    assert accounts.calls == []


def test_demo_login_does_not_exist_when_demo_mode_is_off(client, demo_off, accounts):
    response = login(client, HR_EMAIL)

    assert response.status_code == 404
    assert accounts.calls == []


def test_sign_ins_from_one_address_are_rate_limited(client, demo_on):
    statuses = [login(client, CANDIDATE_EMAIL).status_code for _ in range(DEMO_LOGIN_LIMIT.max_calls + 1)]

    assert statuses[:-1] == [200] * DEMO_LOGIN_LIMIT.max_calls
    assert statuses[-1] == 429


@pytest.mark.parametrize(("email", "name"), [
    ("riya.demo@example.com", "Riya Demo"),
    ("arjun_mehta+jobs@example.com", "Arjun Mehta Jobs"),
    ("dev42@example.com", "Dev"),
    ("1234@example.com", None),
])
def test_names_are_made_from_the_email_local_part(email, name):
    assert name_from_email(email) == name

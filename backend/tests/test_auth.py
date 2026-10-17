import pytest

from app.auth import bearer_token
from tests.fakes import ALICE_TOKEN, auth


@pytest.mark.parametrize(
    ("header", "token"),
    [("Bearer abc", "abc"), ("bearer  abc ", "abc"), ("Basic abc", None), ("Bearer ", None), (None, None)],
)
def test_bearer_token_parsing(header, token):
    assert bearer_token(header) == token


def test_hr_routes_refuse_a_missing_token(client):
    response = client.post("/api/requirements/draft", json={"description": "x" * 30}, headers={"Authorization": ""})

    assert response.status_code == 401
    assert response.json() == {"detail": "Sign in to continue."}


def test_hr_routes_refuse_an_unknown_token(client):
    response = client.post("/api/requirements/draft", json={"description": "x" * 30}, headers=auth("forged"))

    assert response.status_code == 401


def test_hr_routes_refuse_candidates(client):
    response = client.post("/api/extract", data={"text": "resume"}, headers=auth(ALICE_TOKEN))

    assert response.status_code == 403
    assert response.json() == {"detail": "Your account can't do that."}


def test_a_token_whose_user_has_no_profile_is_refused(client, fake_repo):
    fake_repo.tokens["orphan"] = "99999999-0000-4000-8000-000000000000"

    response = client.post("/api/extract", data={"text": "resume"}, headers=auth("orphan"))

    assert response.status_code == 401

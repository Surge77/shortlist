from dataclasses import dataclass, field
from typing import Any

import pytest

from app.main import app
from app.routes import health
from app.supabase_rest import SupabaseError, get_rest


@dataclass
class FakeRest:
    fail: bool = False
    calls: list[tuple[str, dict[str, str]]] = field(default_factory=list)

    async def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        self.calls.append((table, params))
        if self.fail:
            raise SupabaseError()
        return [{"id": "j1"}]


@pytest.fixture
def now(monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(health, "clock", lambda: clock[0])
    monkeypatch.setattr(health, "_last_ok", None)
    return clock


@pytest.fixture
def rest(client, now):
    fake = FakeRest()
    app.dependency_overrides[get_rest] = lambda: fake
    return fake


def test_the_database_check_runs_one_tiny_query(client, rest):
    response = client.get("/api/health/db")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "database": True}
    assert rest.calls == [("jobs", {"select": "id", "limit": "1"})]


def test_uptime_monitors_can_check_it_with_head(client, rest):
    assert client.head("/api/health/db").status_code == 200


def test_a_recent_success_is_reused_so_a_flood_of_requests_cannot_load_the_database(client, rest, now):
    client.get("/api/health/db")
    now[0] += health.CACHE_SECONDS - 1
    client.get("/api/health/db")
    assert len(rest.calls) == 1

    now[0] += 2
    client.get("/api/health/db")
    assert len(rest.calls) == 2


def test_a_database_failure_reports_503_and_is_retried_next_time(client, rest):
    rest.fail = True
    first = client.get("/api/health/db")
    rest.fail = False
    second = client.get("/api/health/db")

    assert (first.status_code, first.json()) == (503, {"ok": False, "database": False})
    assert second.status_code == 200
    assert len(rest.calls) == 2


def test_a_server_without_supabase_settings_reports_503(client, now):
    app.dependency_overrides[get_rest] = lambda: None

    assert client.get("/api/health/db").status_code == 503

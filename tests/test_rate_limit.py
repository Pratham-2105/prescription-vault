"""Login is rate limited so it cannot serve as a password-cracking oracle."""

from collections.abc import Iterator

import pytest
from httpx import AsyncClient

from app.core.limiter import limiter

EMAIL = "ratelimit@test.com"
PASSWORD = "testpass123"


@pytest.fixture(autouse=True)
def _fresh_counters() -> Iterator[None]:
    """
    These tests deliberately exhaust the limit, so they must start from an
    empty bucket regardless of what ran before them.
    """
    limiter.reset()
    yield
    limiter.reset()


async def _register(client: AsyncClient) -> None:
    await client.post(
        "/auth/register",
        json={"email": EMAIL, "password": PASSWORD, "full_name": "Rate Limit"},
    )


async def test_login_blocks_after_five_attempts(client: AsyncClient) -> None:
    await _register(client)
    payload = {"username": EMAIL, "password": "wrong-password"}

    for attempt in range(5):
        resp = await client.post("/auth/login", data=payload)
        assert resp.status_code == 401, f"attempt {attempt + 1} should be allowed"

    blocked = await client.post("/auth/login", data=payload)
    assert blocked.status_code == 429
    assert "retry-after" in blocked.headers


async def test_correct_password_is_also_blocked(client: AsyncClient) -> None:
    """
    The limit must count every attempt, not only failures. If a correct
    password escaped the limit, an attacker could detect a hit by which
    request returns something other than 429.
    """
    await _register(client)

    for _ in range(5):
        await client.post("/auth/login", data={"username": EMAIL, "password": "wrong-password"})

    resp = await client.post("/auth/login", data={"username": EMAIL, "password": PASSWORD})
    assert resp.status_code == 429


async def test_rate_limit_response_does_not_leak_account_existence(
    client: AsyncClient,
) -> None:
    """Preserves the no-enumeration property from the decisions log (§4.10)."""
    unknown = {"username": "ghost@test.com", "password": "whatever"}

    for _ in range(5):
        await client.post("/auth/login", data=unknown)

    blocked = await client.post("/auth/login", data=unknown)
    assert blocked.status_code == 429
    assert "ghost@test.com" not in blocked.text
    assert "not found" not in blocked.text.lower()

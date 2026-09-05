from httpx import AsyncClient


async def test_register_returns_user_without_password(client: AsyncClient) -> None:
    resp = await client.post(
        "/auth/register",
        json={"email": "new@test.com", "password": "securepass123"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == "new@test.com"
    assert "password" not in body
    assert "hashed_password" not in body


async def test_register_rejects_duplicate_email(client: AsyncClient) -> None:
    payload = {"email": "dupe@test.com", "password": "securepass123"}
    await client.post("/auth/register", json=payload)
    resp = await client.post("/auth/register", json=payload)
    assert resp.status_code == 409


async def test_register_rejects_short_password(client: AsyncClient) -> None:
    resp = await client.post("/auth/register", json={"email": "x@test.com", "password": "short"})
    assert resp.status_code == 422


async def test_register_rejects_invalid_email(client: AsyncClient) -> None:
    resp = await client.post(
        "/auth/register", json={"email": "not-an-email", "password": "securepass123"}
    )
    assert resp.status_code == 422


async def test_login_with_wrong_password_fails(client: AsyncClient) -> None:
    await client.post("/auth/register", json={"email": "a@test.com", "password": "securepass123"})
    resp = await client.post(
        "/auth/login", data={"username": "a@test.com", "password": "wrongpass123"}
    )
    assert resp.status_code == 401


async def test_login_error_does_not_leak_user_existence(client: AsyncClient) -> None:
    """Wrong password and unknown user must be indistinguishable."""
    await client.post(
        "/auth/register", json={"email": "real@test.com", "password": "securepass123"}
    )
    wrong_pw = await client.post(
        "/auth/login", data={"username": "real@test.com", "password": "wrongpass123"}
    )
    no_user = await client.post(
        "/auth/login", data={"username": "ghost@test.com", "password": "wrongpass123"}
    )
    assert wrong_pw.status_code == no_user.status_code
    assert wrong_pw.json() == no_user.json()


async def test_me_requires_authentication(client: AsyncClient) -> None:
    resp = await client.get("/auth/me")
    assert resp.status_code == 401


async def test_me_rejects_garbage_token(client: AsyncClient) -> None:
    resp = await client.get("/auth/me", headers={"Authorization": "Bearer not.a.real.token"})
    assert resp.status_code == 401


async def test_me_returns_current_user(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    resp = await client.get("/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == "user_a@test.com"


async def test_login_is_rate_limited(client: AsyncClient) -> None:
    await client.post("/auth/register", json={"email": "rl@test.com", "password": "securepass123"})

    statuses = []
    for _ in range(8):
        resp = await client.post(
            "/auth/login", data={"username": "rl@test.com", "password": "wrongpass123"}
        )
        statuses.append(resp.status_code)

    assert 429 in statuses, f"expected a 429 among {statuses}"


async def test_login_returns_both_tokens(client: AsyncClient) -> None:
    await client.post("/auth/register", json={"email": "rt@test.com", "password": "securepass123"})
    resp = await client.post(
        "/auth/login", data={"username": "rt@test.com", "password": "securepass123"}
    )
    body = resp.json()
    assert body["access_token"]
    assert body["refresh_token"]


async def test_refresh_rotates_the_token(client: AsyncClient) -> None:
    await client.post("/auth/register", json={"email": "rot@test.com", "password": "securepass123"})
    login = await client.post(
        "/auth/login", data={"username": "rot@test.com", "password": "securepass123"}
    )
    old = login.json()["refresh_token"]

    first = await client.post("/auth/refresh", json={"refresh_token": old})
    assert first.status_code == 200
    assert first.json()["refresh_token"] != old

    # The old one must now be dead.
    replay = await client.post("/auth/refresh", json={"refresh_token": old})
    assert replay.status_code == 401


async def test_refresh_rejects_garbage(client: AsyncClient) -> None:
    resp = await client.post("/auth/refresh", json={"refresh_token": "not-a-token"})
    assert resp.status_code == 401


async def test_logout_kills_the_refresh_token(client: AsyncClient) -> None:
    await client.post("/auth/register", json={"email": "lo@test.com", "password": "securepass123"})
    login = await client.post(
        "/auth/login", data={"username": "lo@test.com", "password": "securepass123"}
    )
    token = login.json()["refresh_token"]

    await client.post("/auth/logout", json={"refresh_token": token})

    resp = await client.post("/auth/refresh", json={"refresh_token": token})
    assert resp.status_code == 401

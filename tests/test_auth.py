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
    resp = await client.post(
        "/auth/register", json={"email": "x@test.com", "password": "short"}
    )
    assert resp.status_code == 422


async def test_register_rejects_invalid_email(client: AsyncClient) -> None:
    resp = await client.post(
        "/auth/register", json={"email": "not-an-email", "password": "securepass123"}
    )
    assert resp.status_code == 422


async def test_login_with_wrong_password_fails(client: AsyncClient) -> None:
    await client.post(
        "/auth/register", json={"email": "a@test.com", "password": "securepass123"}
    )
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
    resp = await client.get(
        "/auth/me", headers={"Authorization": "Bearer not.a.real.token"}
    )
    assert resp.status_code == 401


async def test_me_returns_current_user(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    resp = await client.get("/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == "user_a@test.com"
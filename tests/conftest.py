from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.api.deps import get_storage
from app.db.session import get_db
from app.main import app
from app.models import Base
from app.services.storage import LocalStorage

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """A fresh, empty in-memory database for every single test."""
    engine = create_async_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False
    )

    async with session_factory() as session:
        yield session

    await engine.dispose()


@pytest_asyncio.fixture
async def client(
    db_session: AsyncSession, tmp_path: Path
) -> AsyncGenerator[AsyncClient, None]:
    """HTTP client wired to the test database and a temp storage directory."""

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    def override_get_storage() -> LocalStorage:
        return LocalStorage(tmp_path / "storage")

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_storage] = override_get_storage

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test/api/v1") as ac:
        yield ac

    app.dependency_overrides.clear()


async def register_and_login(
    client: AsyncClient, email: str, password: str = "testpass123"
) -> dict[str, str]:
    """Create a user and return an auth header for them."""
    await client.post(
        "/auth/register",
        json={"email": email, "password": password, "full_name": "Test User"},
    )
    resp = await client.post(
        "/auth/login", data={"username": email, "password": password}
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient) -> dict[str, str]:
    return await register_and_login(client, "user_a@test.com")


@pytest_asyncio.fixture
async def other_auth_headers(client: AsyncClient) -> dict[str, str]:
    """A second, unrelated user — for cross-tenant access tests."""
    return await register_and_login(client, "user_b@test.com")


@pytest_asyncio.fixture
async def patient(client: AsyncClient, auth_headers: dict[str, str]) -> dict[str, Any]:
    resp = await client.post(
        "/patients",
        json={"display_name": "Self", "relation": "self"},
        headers=auth_headers,
    )
    return resp.json()


@pytest_asyncio.fixture
async def prescription(
    client: AsyncClient, auth_headers: dict[str, str], patient: dict[str, Any]
) -> dict[str, Any]:
    resp = await client.post(
        "/prescriptions",
        json={
            "patient_id": patient["id"],
            "visit_date": "2026-09-01",
            "doctor_name": "Dr. Sharma",
            "clinic_name": "City Clinic",
            "reason": "fever, 4 days",
        },
        headers=auth_headers,
    )
    return resp.json()
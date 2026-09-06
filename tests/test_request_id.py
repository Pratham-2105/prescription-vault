"""Every response carries a correlation ID (handover §6, Phase A)."""

from httpx import AsyncClient


async def test_request_id_is_returned(client: AsyncClient) -> None:
    resp = await client.get("/health")
    assert resp.headers["x-request-id"]


async def test_client_supplied_id_is_echoed(client: AsyncClient) -> None:
    """Lets a proxy or the mobile client trace one request across systems."""
    resp = await client.get("/health", headers={"X-Request-ID": "trace-abc123"})
    assert resp.headers["x-request-id"] == "trace-abc123"


async def test_malicious_id_is_replaced(client: AsyncClient) -> None:
    """Blocks log injection via newlines and header injection."""
    resp = await client.get("/health", headers={"X-Request-ID": "abc\r\nInjected: evil"})
    returned = resp.headers["x-request-id"]
    assert "\n" not in returned
    assert "\r" not in returned
    assert returned != "abc"


async def test_each_request_gets_a_distinct_id(client: AsyncClient) -> None:
    first = await client.get("/health")
    second = await client.get("/health")
    assert first.headers["x-request-id"] != second.headers["x-request-id"]

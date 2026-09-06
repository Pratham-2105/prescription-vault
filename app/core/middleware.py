"""ASGI middleware: request correlation IDs and content-free access logging."""

from __future__ import annotations

import logging
import time
import uuid
from typing import TYPE_CHECKING

from app.core.logging import request_id_ctx

if TYPE_CHECKING:
    from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger("app.access")

_HEADER = b"x-request-id"
_MAX_ID_LENGTH = 64
_ALLOWED = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")


def _sanitize(value: str | None) -> str | None:
    """Client-supplied IDs are untrusted: they end up in logs and headers."""
    if not value or len(value) > _MAX_ID_LENGTH:
        return None
    if not set(value) <= _ALLOWED:
        return None
    return value


class RequestIdMiddleware:
    """Assigns each request an ID, exposes it in context, echoes it in a header."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = None
        for key, value in scope.get("headers", []):
            if key == _HEADER:
                incoming = value.decode("latin-1", errors="replace")
                break

        request_id = _sanitize(incoming) or uuid.uuid4().hex
        encoded = request_id.encode("latin-1")
        token = request_id_ctx.set(request_id)
        started = time.perf_counter()
        status = 500

        async def send_with_id(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                # Copy rather than append: the underlying list may belong to a
                # Response object that Starlette reuses.
                message = {
                    **message,
                    "headers": [*message.get("headers", []), (_HEADER, encoded)],
                }
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            duration_ms = (time.perf_counter() - started) * 1000
            # Path only. Never the query string (search terms are health data).
            logger.info(
                "%s %s -> %s (%.1fms)",
                scope.get("method", "-"),
                scope.get("path", "-"),
                status,
                duration_ms,
            )
            request_id_ctx.reset(token)

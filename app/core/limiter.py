"""Rate limiting for authentication endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

if TYPE_CHECKING:
    from fastapi import Request

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],
    headers_enabled=True,
)


async def rate_limit_handler(_request: Request, exc: Exception) -> JSONResponse:
    """
    429 in the same shape as other API errors. slowapi's header injection
    only reaches successful responses, so the hint is derived here from the
    limit that was actually exceeded rather than assumed.
    """
    retry_after = 60
    limit = getattr(exc, "limit", None)
    window = getattr(limit, "limit", None) if limit is not None else None
    if window is not None:
        retry_after = int(window.get_expiry())

    return JSONResponse(
        status_code=429,
        content={"detail": "Too many attempts. Please try again shortly."},
        headers={"Retry-After": str(retry_after)},
    )


__all__ = ["RateLimitExceeded", "limiter", "rate_limit_handler"]

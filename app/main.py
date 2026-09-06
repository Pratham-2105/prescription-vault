import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.limiter import RateLimitExceeded, limiter, rate_limit_handler
from app.core.logging import configure_logging, request_id_ctx
from app.core.middleware import RequestIdMiddleware
from app.db.session import engine

configure_logging(settings.LOG_LEVEL)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    logger.info("Starting %s (%s)", settings.PROJECT_NAME, settings.ENVIRONMENT)
    yield
    await engine.dispose()
    logger.info("Shutdown complete")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    openapi_url="/openapi.json",
)

# Rate limiting: slowapi reads the limiter off app.state.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Starlette applies middleware in reverse registration order, so registering
# this last makes it outermost: the request ID exists before CORS, rate
# limiting, routes, or the error handler run.
app.add_middleware(RequestIdMiddleware)


@app.exception_handler(Exception)
async def unhandled_exception_handler(
    request: Request,
    _exc: Exception,
) -> JSONResponse:
    # The stack trace stays server-side; the client gets an ID to quote.
    logger.exception(
        "Unhandled error on %s %s",
        request.method,
        request.url.path,
    )

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Internal server error",
            "request_id": request_id_ctx.get(),
        },
    )


@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "environment": settings.ENVIRONMENT,
    }


app.include_router(api_router, prefix=settings.API_V1_PREFIX)

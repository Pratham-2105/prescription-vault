# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- build stage
# Dependencies are installed here, with compilers available. The result is a
# self-contained virtualenv that gets copied into the final image — so gcc and
# the build headers never ship to production.
FROM python:3.13-slim AS builder

# Pinned to 3.13 on purpose: 3.14 broke the host venv (handover §10.1) and the
# same pins are what CI tests against.

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copied before the source so Docker caches this layer: editing app code does
# not trigger a reinstall of every dependency.
COPY requirements.txt ./
RUN pip install -r requirements.txt

# ---------------------------------------------------------------- final stage
FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

# curl is here only for the healthcheck below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# A compromised process should not be root. Created before the copy so the
# application files can be owned by it.
RUN useradd --create-home --uid 1000 appuser

COPY --from=builder /opt/venv /opt/venv

WORKDIR /app

COPY --chown=appuser:appuser alembic.ini ./
COPY --chown=appuser:appuser alembic ./alembic
COPY --chown=appuser:appuser app ./app

# Mount point for the storage volume, plus /app itself: WORKDIR created it
# root-owned, so without this a run with no DATABASE_URL override falls back
# to the relative SQLite default and alembic dies trying to create /app/dev.db
# as a non-root user.
RUN mkdir -p /app/storage && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

# The orchestrator restarts the container when this fails. /health is the
# existing endpoint.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

# Migrations run on every start, then uvicorn replaces the shell as PID 1
# (that is what `exec` is for) so Docker's stop signal reaches it directly.
#
# Written inline rather than as an entrypoint.sh on purpose: a shell script
# authored on Windows can pick up CRLF line endings, and the stray \r makes
# the shebang fail with a baffling "not found" error.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
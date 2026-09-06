[![CI](https://github.com/Pratham-2105/prescription-vault/actions/workflows/ci.yml/badge.svg)](https://github.com/Pratham-2105/prescription-vault/actions/workflows/ci.yml)

# Prescription Vault

Storage and organisation for medical prescriptions. Users photograph or upload
prescriptions, tag them with doctor, clinic, and visit date, and retrieve them
later — including the medications and dosage schedules from each visit.

Built to solve a specific problem: paper prescriptions get lost, and the "what
was I prescribed six months ago" question comes up at every new doctor's
appointment.

## Stack

**Backend**
- **FastAPI** — async API with OpenAPI docs generated from type hints
- **SQLAlchemy 2.0** (async) + **Alembic** — ORM and versioned migrations
- **PostgreSQL** in production, SQLite for local development
- **JWT** access tokens with rotating refresh tokens, bcrypt password hashing
- **slowapi** — rate limiting on all authentication endpoints
- **pytest** — 45 tests, 83% coverage

**Client**
- **Expo** + **React Native Web** — one codebase for iOS, Android, and web
- **Expo Router** — file-based routing with generated route types
- **TypeScript** in strict mode, with API types generated from the OpenAPI schema
- **Vitest** — data-layer tests that run in plain Node, no simulator

## Design decisions

**Users and patients are separate entities.** Most people managing
prescriptions carefully are doing it for a parent or child. Splitting `User`
(who authenticates) from `Patient` (whose records these are) supports family
profiles without a painful migration later.

**UUID primary keys.** The mobile client is offline-first and must be able to
create records with valid IDs before reaching the server. Sequential integers
can't do that.

**Ownership checks live in one place.** Every route that touches a resource
declares a dependency like `OwnedPrescription`, which resolves the object via a
join back to `Patient.owner_id`. Endpoints cannot forget the check because it
runs before the handler does. `tests/test_isolation.py` covers this as a
regression suite.

**Route guards mirror that pattern on the client.** Protected screens live
under a route group whose layout redirects unauthenticated visitors. A new
screen is protected by virtue of where the file sits, not by remembering to add
a check.

**Storage is behind an interface.** `StorageBackend` is abstract; local disk
today, S3-compatible object storage in production, with no changes outside the
service layer.

**Client types are generated, not written.** `openapi-typescript` derives
`client/src/types/api.d.ts` from the running server's schema, so the client's
model of the API cannot silently drift from Pydantic's.

**Token refresh is single-flight.** Concurrent requests that all expire at once
share one refresh call, and a request whose 401 arrives after another has
already refreshed retries with the new token rather than rotating again. Both
races are covered by tests, because neither is reproducible by hand.

**Logs carry request IDs, never content.** The outermost middleware assigns
each request an ID and puts it in a `ContextVar`, so every log line and the 500
response body share it — a user can quote an ID and it maps to their exact
request. The access log records method, path, status, and duration only. Query
strings stay out of it, because `?q=diabetes` in a log file is a health
disclosure.

## Running locally

**Backend**

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt

cp .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(48))"   # paste into JWT_SECRET

alembic upgrade head
uvicorn app.main:app --reload
```

Interactive docs at http://localhost:8000/docs

**Client**

```bash
cd client
npm install
npm run types:api      # regenerate API types (backend must be running)
npm run web            # or: npm run android / npm run ios
```

To run on a physical device, start the backend with `--host 0.0.0.0` and set
`EXPO_PUBLIC_API_URL` to your machine's LAN address.

## Tests

```bash
pytest --cov=app                      # backend
cd client && npm test && npm run typecheck
```

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/auth/register` | Create account |
| POST | `/api/v1/auth/login` | Obtain token pair |
| POST | `/api/v1/auth/refresh` | Rotate refresh token |
| POST | `/api/v1/auth/logout` | Revoke one refresh token |
| GET | `/api/v1/patients` | List family profiles |
| POST | `/api/v1/prescriptions` | Record a visit |
| GET | `/api/v1/prescriptions` | Timeline, filtered and paginated |
| POST | `/api/v1/prescriptions/{id}/attachments` | Upload a scan |
| POST | `/api/v1/prescriptions/{id}/medications` | Add prescribed medication |

Auth endpoints are rate limited per IP; limits are configurable via
`LOGIN_RATE_LIMIT` and friends in `.env`.

## Project layout

app/ FastAPI backend
alembic/ database migrations
tests/ backend test suite
client/ Expo app (iOS, Android, web)
src/api/ HTTP client, token storage, auth
src/app/ Expo Router screens
src/state/ session context
src/ui/ shared components


## Disclaimer

A record-keeping tool, not a medical device. It does not provide medical
advice, drug interaction warnings, or dosage recommendations.
# Prescription Vault

[![CI](https://github.com/Pratham-2105/prescription-vault/actions/workflows/ci.yml/badge.svg)](https://github.com/Pratham-2105/prescription-vault/actions/workflows/ci.yml)

Storage and organisation for medical prescriptions. Users photograph or upload prescriptions, tag them with doctor, clinic, and visit date, and retrieve them later — including the medications and dosage schedules from each visit.

Built to solve a specific problem: paper prescriptions get lost, and the "what was I prescribed six months ago?" question comes up at every new doctor's appointment.

## Stack

### Backend

* **FastAPI** — async API with OpenAPI docs generated from type hints
* **SQLAlchemy 2.0** (async) + **Alembic** — ORM and versioned migrations
* **PostgreSQL** in production, SQLite for local development
* **JWT** access tokens with rotating refresh tokens, bcrypt password hashing
* **slowapi** — rate limiting on all authentication endpoints
* **pytest** — 45 tests, 83% coverage

### Client

* **Expo** + **React Native Web** — one codebase for iOS, Android, and web
* **Expo Router** — file-based routing with generated route types
* **TypeScript** in strict mode, with API types generated from the OpenAPI schema
* **Vitest** — data-layer tests that run in plain Node, no simulator

## Design Decisions

### Users and patients are separate entities

Most people managing prescriptions carefully are doing it for a parent or child. Splitting `User` (who authenticates) from `Patient` (whose records these are) supports family profiles without a painful migration later.

### UUID primary keys

The mobile client is offline-first and must be able to create records with valid IDs before reaching the server. Sequential integers can't do that.

### Ownership checks live in one place

Every route that touches a resource declares a dependency like `OwnedPrescription`, which resolves the object via a join back to `Patient.owner_id`.

Endpoints cannot forget the ownership check because it runs before the handler does. `tests/test_isolation.py` covers this as a regression suite.

### Route guards mirror that pattern on the client

Protected screens live under a route group whose layout redirects unauthenticated visitors. A new screen is protected by virtue of where the file sits, rather than by remembering to add an individual check.

### Storage is behind an interface

`StorageBackend` is abstract; local disk is used today, with S3-compatible object storage planned for production. No changes outside the service layer are required when switching backends.

### Client types are generated, not written

`openapi-typescript` derives `client/src/types/api.d.ts` from the server's OpenAPI schema, so the client's model of the API cannot silently drift from Pydantic's.

### Token refresh is single-flight

Concurrent requests that all expire at once share one refresh call. A request whose `401` arrives after another request has already refreshed retries with the new token rather than rotating again.

Both races are covered by tests because neither is reliably reproducible by hand.

### Logs carry request IDs, never content

The outermost middleware assigns each request an ID and puts it in a `ContextVar`, so every log line and the `500` response body share it.

A user can quote an ID and it maps to their exact request. The access log records method, path, status, and duration only.

Query strings stay out of logs because something like `?q=diabetes` in a log file would constitute a health disclosure.

## Running Locally

### Backend

```bash
python -m venv .venv

# macOS / Linux
source .venv/bin/activate

# Windows
.venv\Scripts\activate

pip install -r requirements.txt -r requirements-dev.txt

# Create your environment file
cp .env.example .env

# Generate a JWT secret
python -c "import secrets; print(secrets.token_urlsafe(48))"

# Paste the generated value into JWT_SECRET in .env

# Apply database migrations
alembic upgrade head

# Start the development server
uvicorn app.main:app --reload
```

Interactive API documentation:

http://localhost:8000/docs

### Client

```bash
cd client

npm install

# Regenerate API types
# Backend must be running
npm run types:api

# Start the web client
npm run web

# Or start a native client
npm run android
npm run ios
```

To run the client on a physical device, start the backend with:

```bash
uvicorn app.main:app --host 0.0.0.0 --reload
```

Then set `EXPO_PUBLIC_API_URL` to your machine's LAN address.

## Tests

### Backend

```bash
pytest --cov=app
```

### Client

```bash
cd client

npm test
npm run typecheck
```

## API

| Method | Path                                     | Purpose                          |
| ------ | ---------------------------------------- | -------------------------------- |
| `POST` | `/api/v1/auth/register`                  | Create account                   |
| `POST` | `/api/v1/auth/login`                     | Obtain token pair                |
| `POST` | `/api/v1/auth/refresh`                   | Rotate refresh token             |
| `POST` | `/api/v1/auth/logout`                    | Revoke one refresh token         |
| `GET`  | `/api/v1/patients`                       | List family profiles             |
| `POST` | `/api/v1/prescriptions`                  | Record a visit                   |
| `GET`  | `/api/v1/prescriptions`                  | Timeline, filtered and paginated |
| `POST` | `/api/v1/prescriptions/{id}/attachments` | Upload a scan                    |
| `POST` | `/api/v1/prescriptions/{id}/medications` | Add prescribed medication        |

Authentication endpoints are rate limited per IP. Limits are configurable through `LOGIN_RATE_LIMIT` and related settings in `.env`.

## Project Layout

```text
prescription-vault/
├── app/                    # FastAPI backend
├── alembic/                # Database migrations
├── tests/                  # Backend test suite
└── client/                 # Expo app (iOS, Android, web)
    ├── src/
    │   ├── api/            # HTTP client, token storage, auth
    │   ├── app/            # Expo Router screens
    │   ├── state/          # Session context
    │   └── ui/             # Shared components
    └── ...
```

## Disclaimer

Prescription Vault is a record-keeping tool, not a medical device.

It does not provide medical advice, drug interaction warnings, or dosage recommendations.

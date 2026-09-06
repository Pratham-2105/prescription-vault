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
* **Pillow** — upload sanitisation and thumbnail generation
* **pytest** — 61 tests, 83% coverage

### Client

* **Expo** + **React Native Web** — one codebase for iOS, Android, and web
* **Expo Router** — file-based routing with generated route types
* **TanStack Query** — server-state cache, deduplication, and pagination
* **TypeScript** in strict mode, with API types generated from the OpenAPI schema
* **Vitest** — 9 data-layer tests that run in plain Node, no simulator

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

### Screens talk to a repository, never to HTTP

Every screen reads through a `PrescriptionRepository` interface. The HTTP implementation is the only code that knows a URL or a snake_case field name, and it maps wire objects into domain types before anything else sees them.

Offline support means adding a SQLite implementation and changing one line of wiring. Screens that called `fetch` directly would need rewriting instead of swapping.

### Server state is cached, not stored in components

TanStack Query owns loading and error state, deduplicates concurrent requests for the same data, and merges paginated results. The timeline uses cursor-free `limit`/`offset` paging against the list endpoint's `total`.

Image bytes are cached indefinitely: an attachment ID's contents never change, so a re-render or a return visit costs nothing.

### Uploads are sanitised, never trusted

The client-declared `content_type` is ignored entirely — it is an attacker-controlled string. File type is determined from magic bytes, and a payload declaring itself a JPEG is rejected if its contents say otherwise.

Images are then re-encoded through Pillow, which is what strips the metadata: decode to pixels, write a fresh file, and everything else is gone. EXIF orientation is applied to the pixels first, or every portrait photo would end up sideways.

This matters because a prescription photo carries the coordinates of the clinic where it was taken. That is health data leaking through a field nobody looks at. There is a test that plants real coordinates and asserts they are absent afterwards.

Uploads are also capped at 2400px with a 400px thumbnail generated, and dimensions are checked from the header before any pixels are decoded — a small file can declare a hundred megapixels, and the request size limit says nothing about decompressed size.

### Images are fetched, not linked

An `<Image>` source cannot carry an `Authorization` header — the platform image loader issues its own request. Attachment bytes are fetched through the API client and handed to the view as data.

The alternative, a token in the URL query string, would put a bearer credential into server logs, proxy logs, and browser history. Signed short-lived URLs are the production answer and arrive with object storage.

### Storage is behind an interface

`StorageBackend` is abstract; local disk is used today, with S3-compatible object storage planned for production. No changes outside the service layer are required when switching backends.

Storage keys are opaque and never leave the server. Clients receive a `has_thumbnail` boolean rather than a key.

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

On Windows, if activation appears to succeed but commands are not found, call the
virtualenv's executables directly:
# Prescription Vault

[![CI](https://github.com/Pratham-2105/prescription-vault/actions/workflows/ci.yml/badge.svg)](https://github.com/Pratham-2105/prescription-vault/actions/workflows/ci.yml)
[![Python 3.13](https://img.shields.io/badge/python-3.13-blue.svg)](https://www.python.org/)
[![TypeScript](https://img.shields.io/badge/typescript-strict-blue.svg)](https://www.typescriptlang.org/)

**A record-keeping app for paper prescriptions — photograph a prescription, tag it with doctor, clinic, and visit date, and find it again six months later when a new doctor asks what you were prescribed.**

🔗 **[Live API + interactive docs](https://prescription-vault-production.up.railway.app/docs)** — FastAPI backend on Railway with PostgreSQL

> The API is live and explorable. Register an account in the Swagger UI, create a patient, and upload a prescription to watch the full sanitisation pipeline run.

---

## Screenshots

| Timeline | Visit detail | Capture |
| --- | --- | --- |
| ![Timeline](docs/screenshots/timeline.png) | ![Detail](docs/screenshots/detail.png) | ![Capture](docs/screenshots/capture.png) |

---

## Why this exists

Paper prescriptions get lost. Every new doctor asks what you were prescribed six months ago, and the honest answer is usually a shrug or a photo buried in a camera roll of four thousand images.

This is a searchable record of visits: who you saw, when, why, what they prescribed, and the scan of the paper itself. It is explicitly **not** a medical device — no interaction warnings, no dosage advice. That line is a design constraint, not a missing feature.

Three product rules shaped every decision below:

1. **Record-keeping, not medical advice.** A liability line, held deliberately.
2. **OCR output will always be an editable draft the user confirms.** A misread dosage is the one bug that can physically hurt someone.
3. **Capture in under 30 seconds.** Photo, tagged, saved. That number is the product.

---

## Quick start

The whole stack — API, PostgreSQL, migrations — runs with one command:

```bash
git clone https://github.com/Pratham-2105/prescription-vault.git
cd prescription-vault
docker compose up --build
```

Interactive API docs: <http://localhost:8000/docs>

Migrations apply automatically on container start. No `.env` file is needed for the local stack; `docker-compose.yml` supplies development values.

<details>
<summary><b>Running the client</b></summary>

```bash
cd client
npm install
npm run web          # or: npm run android / npm run ios
```

The web client runs on port 8081 and expects the API on port 8000. To run against a physical device or the deployed API, set `EXPO_PUBLIC_API_URL`.

</details>

<details>
<summary><b>Running the backend without Docker</b></summary>

```bash
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt

cp .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(48))"   # paste into JWT_SECRET

alembic upgrade head
uvicorn app.main:app --reload
```

On Windows, if activation appears to succeed but commands are not found, call the virtualenv's executables directly:

```
.venv\Scripts\python.exe -m uvicorn app.main:app --reload
.venv\Scripts\alembic.exe upgrade head
```

</details>

---

## What works today

**Backend — complete**

- Registration, login, refresh with rotation, logout, logout-all
- Family profiles: one account, many patients
- Prescriptions with filtering, search across doctor/clinic/reason/notes, and pagination
- Multi-page attachments with magic-byte sniffing, EXIF stripping, and thumbnail generation
- Medications per visit using Indian frequency notation (`1-0-1`)
- Deployed to Railway with PostgreSQL, persistent storage, and migrations on boot

**Client — capture and retrieval loop complete**

- Sign in, session restore, route guards
- Timeline grouped by visit date with infinite scroll
- Visit detail with page swiper and medication list
- Capture: patient switcher, visit form, camera or library upload, inline medication entry

**Tests:** 61 backend (83% coverage) · 9 client · all green in CI against PostgreSQL

---

## Engineering notes

The decisions below are the ones worth defending. Each names the alternative it rejected and why.

<details open>
<summary><b>Security and data handling</b></summary>

### Uploads are sanitised, never trusted

The client-declared `content_type` is ignored entirely — it is an attacker-controlled string. File type is determined from magic bytes, and a payload declaring itself a JPEG is rejected if its contents say otherwise.

Images are then re-encoded through Pillow, which *is* the metadata strip: decode to pixels, write a fresh file, and everything else is gone. EXIF orientation is applied to the pixels first, or every portrait photo ends up sideways.

This matters because **a prescription photo carries the GPS coordinates of the clinic where it was taken.** That is health data leaking through a field nobody looks at. A test plants real coordinates in an image and asserts they are absent afterwards.

Dimensions are read from the file header before any pixels are decoded — a small file can declare a hundred megapixels, and a request size limit says nothing about decompressed size. Full images are capped at 2400px, with a 400px thumbnail generated alongside.

### Ownership checks live in one place

Every route touching a resource declares a dependency such as `OwnedPrescription`, which resolves the object through a join back to `Patient.owner_id`. Endpoints *cannot* forget the check, because it runs before the handler does.

A wrong owner receives **404, not 403** — a 403 confirms the resource exists. `tests/test_isolation.py` is a seven-test regression suite against exactly this.

### Logs carry request IDs, never content

The outermost middleware assigns each request an ID and stores it in a `ContextVar`, so every log line and the 500 response body share it. A user can quote an ID and it maps to their exact request.

The access log records method, path, status, and duration only. Query strings stay out because `?q=diabetes` in a log file is a health disclosure. Request bodies stay out because a body is a medical record.

`ContextVar` plus raw ASGI middleware rather than `BaseHTTPMiddleware`: the latter breaks context propagation and streaming responses.

### Refresh tokens rotate

Refresh tokens are SHA-256 hashed (not bcrypt — a random 43-character secret does not need slow hashing), stored server-side, and deleted the moment they are used. A stolen token breaks the legitimate client's next refresh, which makes theft *detectable* rather than silent.

The token travels in the request body rather than a header, because proxies log headers.

Login returns an identical response for a wrong password and an unknown email, and rate-limit 429s reveal nothing about account existence. Both are tested.

</details>

<details>
<summary><b>Data model and API</b></summary>

### Users and patients are separate entities

Most people managing prescriptions carefully are doing it for a parent or a child. Splitting `User` (who authenticates) from `Patient` (whose records these are) supports family profiles without a painful migration later, and anticipates family sharing without building it yet.

### UUID primary keys

The client is offline-first by design and must mint valid IDs before reaching the server. Sequential integers cannot do that, and they leak row counts.

### `frequency_code` stores the raw notation

`"1-0-1"` is universal on Indian prescriptions and expands deterministically into a schedule. Storing the doctor's own notation means the app restates what was written rather than interpreting it — product rule 1 enforced at the schema level.

### Storage sits behind an interface

`StorageBackend` is abstract, with `save`, `load`, `delete`, and an optional `local_path`. Local disk on a mounted volume backs production today; an S3-compatible implementation exists for object storage.

Endpoints serve through `local_path` when the backend has one and stream from `load` otherwise, so neither the router nor the model knows which backend is live. Storage keys are opaque and never leave the server — clients receive a `has_thumbnail` boolean, not a key.

</details>

<details>
<summary><b>Client architecture</b></summary>

### Screens talk to a repository, never to HTTP

Every screen reads and writes through a `PrescriptionRepository` interface. The HTTP implementation is the only code that knows a URL or a snake_case field name, and it maps wire objects into domain types before anything else sees them.

Offline support means adding a SQLite implementation and changing one line of wiring. Screens calling `fetch` directly would need rewriting instead.

### Server state is cached, not held in components

TanStack Query owns loading and error state, deduplicates concurrent requests, and merges paginated results. Image bytes are cached indefinitely, since an attachment ID's contents never change.

After a write the cache is **invalidated rather than patched**. Timeline grouping depends on the server's exact row ordering (`visit_date DESC, created_at DESC`), so inserting a row client-side would mean reimplementing that sort — and a backdated visit would land in the wrong section.

### Saving a visit is three calls that tolerate partial failure

Create the prescription, upload each page, add each medicine. If a page fails to upload, the visit is still saved and the user is told exactly what did not land, with a retry that targets the existing record rather than creating a duplicate.

The record is the thing worth keeping. This is also the shape an offline outbox needs: every step independently retryable.

### Token refresh is single-flight

Concurrent requests that all expire at once share one refresh call. A request whose 401 arrives *after* another request has already refreshed retries with the new token rather than rotating again — otherwise rotation invalidates the token the second refresh is about to use.

Both races are covered by tests, because neither is reliably reproducible by hand.

### Images are fetched, not linked

An `<Image>` source cannot carry an `Authorization` header; the platform image loader issues its own request. Attachment bytes are fetched through the API client and handed to the view as data.

The alternative, a token in the URL query string, would put a bearer credential into server logs, proxy logs, and browser history.

### Client types are generated, not written

`openapi-typescript` derives `client/src/types/api.d.ts` from the server's OpenAPI schema, so the client's model of the API cannot silently drift from Pydantic's.

</details>

---

## Stack

**Backend** — FastAPI · SQLAlchemy 2.0 (async) · Alembic · PostgreSQL · Pydantic v2 · slowapi · Pillow · pytest

**Client** — Expo · React Native Web · Expo Router · TanStack Query · TypeScript (strict) · Vitest

**Infrastructure** — Docker (multi-stage, non-root) · Railway · GitHub Actions

---

## API

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `POST` | `/api/v1/auth/register` | Create account |
| `POST` | `/api/v1/auth/login` | Obtain token pair |
| `POST` | `/api/v1/auth/refresh` | Rotate refresh token |
| `POST` | `/api/v1/auth/logout` | Revoke one refresh token |
| `GET` | `/api/v1/patients` | List family profiles |
| `POST` | `/api/v1/patients` | Add a person |
| `POST` | `/api/v1/prescriptions` | Record a visit |
| `GET` | `/api/v1/prescriptions` | Timeline, filtered and paginated |
| `GET` | `/api/v1/prescriptions/{id}` | One visit with its attachments |
| `POST` | `/api/v1/prescriptions/{id}/attachments` | Upload a scan |
| `GET` | `/api/v1/attachments/{id}/file` | Download the stored image |
| `GET` | `/api/v1/attachments/{id}/thumbnail` | Small preview for the timeline |
| `POST` | `/api/v1/prescriptions/{id}/medications` | Add prescribed medication |
| `GET` | `/api/v1/prescriptions/{id}/medications` | Medications from one visit |

Authentication endpoints are rate limited per IP, configurable through `LOGIN_RATE_LIMIT` and related settings.

Accepted uploads: JPEG, PNG, WebP, HEIC, and PDF. Images are re-encoded to JPEG; PDFs pass through unchanged.

---

## Tests

```bash
# Backend
pytest --cov=app

# Client
cd client && npm test && npm run typecheck
```

CI runs three jobs on every pull request: lint and type check and test, an Alembic round-trip against a real PostgreSQL service (`upgrade head` → `downgrade base` → `upgrade head`), and the client type check and test suite.

The PostgreSQL job exists because SQLite silently drops timezone information, and a naive-versus-aware datetime comparison in refresh-token expiry only surfaces on a real database.

---

## Project layout

```text
prescription-vault/
├── app/                    # FastAPI backend
│   ├── core/               # Config, security, logging, middleware, limiter
│   ├── models/             # SQLAlchemy models
│   ├── schemas/            # Pydantic request and response models
│   ├── services/           # Storage backends, image pipeline
│   └── api/                # Dependencies and versioned routers
├── alembic/                # Database migrations
├── tests/                  # Backend test suite
├── client/                 # Expo app (iOS, Android, web)
│   └── src/
│       ├── api/            # HTTP client, token storage, auth
│       ├── app/            # Expo Router screens
│       ├── data/           # Repository interfaces, implementations, hooks
│       ├── domain/         # Types the app speaks, independent of transport
│       ├── features/       # Feature components and pure helpers
│       ├── state/          # Session context
│       └── ui/             # Shared components
├── Dockerfile              # Multi-stage, non-root, healthcheck
└── docker-compose.yml      # API + PostgreSQL
```

---

## Known limitations

Named deliberately rather than left to be discovered.

- **No offline support yet.** The client is architected for it — repository seam, UUID primary keys, no direct HTTP from screens — but the SQLite mirror and sync engine are not built. The app currently requires a connection.
- **Rate limiting is in-process.** Counters live in each worker's memory, so N workers permit N times the configured limit. A Redis backend is the fix, and matters only once the deployment scales past one process.
- **Rate limiting is per-IP.** On carrier-grade NAT, common across Indian mobile networks, thousands of users can share an address. A per-email limit alongside a looser per-IP one is the intended answer.
- **No OCR.** Medication entry is manual. OCR is planned as an editable draft the user confirms, never an auto-save.
- **Password minimum is 8 characters.** Weak, and rate limiting does not stop a distributed attack.
- **No data-protection review.** A DPDP Act 2023 review and a privacy policy are prerequisites before any real user's records go in.

---

## Roadmap

- **Offline sync** — SQLite mirror with an outbox, a server-side change log keyed by sequence number rather than timestamp, and last-write-wins conflict resolution at row level
- **Reminders** — dose schedules expanded on-device from `frequency_code`, refill reminders from `start_date + duration_days`
- **OCR** — vision model extraction into a draft the user confirms before saving
- **`prescan`** — a C++17 image preprocessing engine (adaptive threshold, deskew, page crop) exposed to the backend through pybind11 and to the client through WASM, with a fuzzing harness because image parsers are untrusted-input code

---

## Disclaimer

Prescription Vault is a record-keeping tool, not a medical device.

It does not provide medical advice, drug interaction warnings, or dosage recommendations.
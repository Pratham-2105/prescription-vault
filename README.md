# Prescription Vault

[![CI](https://github.com/Pratham-2105/prescription-vault/actions/workflows/ci.yml/badge.svg)](https://github.com/Pratham-2105/prescription-vault/actions/workflows/ci.yml)
[![Python 3.13](https://img.shields.io/badge/python-3.13-blue.svg)](https://www.python.org/)
[![TypeScript](https://img.shields.io/badge/typescript-strict-blue.svg)](https://www.typescriptlang.org/)

**An offline-first Android app for paper prescriptions. Photograph a prescription, tag it with doctor, clinic, and visit date, and find it again six months later — at a pharmacy counter with no signal, or on the phone of a relative who needs it while you are in hospital.**

Everything lives on the device. No account, no sign-in, no network required. A FastAPI backend exists as an optional cloud-backup target behind a build flag, but the app is complete without it.

🔗 **[Live API + interactive docs](https://prescription-vault-production.up.railway.app/docs)** — the optional backend, deployed on Railway with PostgreSQL

---

## Why this exists

Paper prescriptions get lost. Every new doctor asks what you were prescribed six months ago, and the honest answer is usually a shrug or a photo buried in a camera roll of four thousand images.

This is a searchable record of visits: who you saw, when, why, what they prescribed, and the scan of the paper itself.

**Why offline is the whole design.** The two situations where this app actually matters are a pharmacy counter with no signal and a relative needing the records while the prescription holder is in hospital. An app that needs a network round trip to display a prescription fails at exactly the moment it is supposed to work. So the device holds the canonical copy and the cloud is a backup, not a dependency.

Three product rules shaped every decision below:

1. **Record-keeping, not medical advice.** No interaction warnings, no dosage suggestions, ever. A liability line held deliberately, not a missing feature.
2. **Any extracted or inferred data is an editable draft the user confirms.** Never auto-saved. A misread dosage is the one bug that can physically hurt someone.
3. **Capture in under 30 seconds.** Photo, tagged, saved. That number is the product.

---

## What works today

**The app — feature complete for the core loop**

- Opens straight to the timeline. No sign-in, no network.
- Capture: patient switcher, visit form, camera or gallery upload, inline medication entry
- Timeline grouped by visit date, with page thumbnails and infinite scroll
- Search across doctor, clinic, reason, and notes, plus filtering by family member
- Visit detail with a page swiper and medication list
- All records and images in on-device SQLite and the app's document directory
- Versioned local schema migrations, so an app update cannot wipe existing records

Verified on a physical Android device: created a visit with photos, **switched to airplane mode**, created another, restarted the app, and every record and image was intact.

**The optional backend — complete and deployed**

- Registration, login, refresh with rotation, logout, logout-all
- Family profiles, prescriptions, multi-page attachments, medications
- Upload sanitisation: magic-byte sniffing, EXIF stripping, thumbnail generation
- Deployed to Railway with PostgreSQL, persistent storage, migrations on boot

**Tests:** 63 backend (83% coverage) · 9 client · three CI jobs green, including an Alembic round-trip against real PostgreSQL

---

## Quick start

### The app

```bash
git clone https://github.com/Pratham-2105/prescription-vault.git
cd prescription-vault/client
npm install
npx expo start
```

Scan the QR code with [Expo Go](https://expo.dev/go) on an Android device. No Android SDK needed, and no backend — the app is entirely self-contained.

> `npm run web` does not work: `expo-sqlite` needs a WASM worker Metro cannot resolve. Android is the target.

### The optional backend

The whole stack — API, PostgreSQL, migrations — runs with one command:

```bash
docker compose up --build
```

Interactive API docs: <http://localhost:8000/docs>. Migrations apply on container start, and `docker-compose.yml` supplies development values, so no `.env` is needed locally.

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

## Configuration

**Client** — `EXPO_PUBLIC_*` variables are inlined at bundle time, so Metro must be restarted after changing one.

| Variable | Default | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_CLOUD_ENABLED` | `false` | `true` restores the auth screens and switches the repositories to HTTP. One codebase, not two versions. |
| `EXPO_PUBLIC_API_URL` | per-platform localhost | API base URL. Needed when `CLOUD_ENABLED` is true and the app runs on a physical device. |

**Backend** — `JWT_SECRET` is required and the app refuses to start without it. That is fail-fast config working, not a bug.

| Variable | Default | Purpose |
| --- | --- | --- |
| `JWT_SECRET` | *(required)* | Signing key for access tokens |
| `DATABASE_URL` | SQLite dev file | Normalised to the asyncpg driver if given as `postgresql://` |
| `STORAGE_BACKEND` | `local` | `local` or `r2` (S3-compatible object storage) |
| `STORAGE_DIR` | `./storage` | Where `local` writes. Must be a mounted volume in production. |
| `LOGIN_RATE_LIMIT` | `5/minute` | Per-IP limit; `REGISTER_`, `REFRESH_`, `LOGOUT_` equivalents exist |
| `CORS_ORIGINS` | localhost only | Browser clients on other origins are rejected |

---

## Engineering notes

The decisions worth defending. Each names the alternative it rejected and why.

<details open>
<summary><b>Local-first architecture</b></summary>

### The device owns the data

The phone mints UUIDs, assigns page numbers, sets timestamps, and processes images. The server used to do all of that. What made the switch cheap was a decision taken well before it was needed: **UUID primary keys**, chosen so a client could create valid records offline. A sequential integer cannot be minted on a phone with no network.

### Screens talk to a repository, never to storage

Every screen reads and writes through a `PrescriptionRepository` interface. There are two implementations — SQLite and HTTP — and a single flag decides which is constructed.

Swapping the entire data layer from a REST API to a local database **changed no screen**. That was the whole purpose of the seam, and it is the clearest evidence that the boundary was drawn in the right place.

### Migrations are versioned from the first release

The local schema is tracked with SQLite's `user_version`, checked on open, with outstanding migrations applied in a transaction each. Once a migration ships it is frozen — editing it would mean devices that already ran it never see the change while fresh installs get a different schema.

This is cheap now and impossible to retrofit safely once the app is public and someone is holding two hundred prescriptions.

### Foreign keys are enabled explicitly

SQLite ships with `PRAGMA foreign_keys = OFF`, which makes every `ON DELETE CASCADE` in the schema decorative: deleting a prescription would silently leave its attachments behind forever. It is a per-connection setting, which is also why there is exactly one connection.

### No sync columns, no conflict resolution

`synced_at` and `deleted_at` are deliberately absent. Conflict resolution is the genuinely hard part of offline-first architecture, and it exists only when two devices can modify the same record. Shipping without accounts means one device and one writer, so there is nothing to resolve. That cost gets paid if and when a multi-device tier is worth building.

</details>

<details>
<summary><b>Data handling and security</b></summary>

### Uploads are sanitised, never trusted

On the server, the client-declared `content_type` is ignored entirely — it is an attacker-controlled string. File type comes from magic bytes, and a payload declaring itself a JPEG is rejected if its contents say otherwise.

Images are re-encoded through Pillow, which *is* the metadata strip: decode to pixels, write a fresh file, and everything else is gone. EXIF orientation is applied to the pixels first, or every portrait photo ends up sideways.

This matters because **a prescription photo carries the GPS coordinates of the clinic where it was taken.** That is health data leaking through a field nobody looks at. A test plants real coordinates in an image and asserts they are absent afterwards.

Dimensions are read from the file header before any pixels are decoded — a small file can declare a hundred megapixels, and a request size limit says nothing about decompressed size.

The on-device pipeline mirrors the same numbers: cap the long edge at 2400px, re-encode as JPEG, generate a 400px preview.

### Files go to permanent storage, never the cache

The image manipulator writes to the cache directory, which the OS may purge under storage pressure. For an app whose premise is "your prescriptions are safe here," that would be silent data loss, so processed files are moved into the document directory as a final step.

### Native image handles are released explicitly

A 2400px bitmap is roughly 23 MB of native memory that the JavaScript garbage collector cannot see. Without an explicit `release()` in a `finally`, a few large photos in sequence will exhaust memory on a mid-range device.

### Ownership checks live in one place

On the server, every route touching a resource declares a dependency such as `OwnedPrescription`, which resolves the object through a join back to `Patient.owner_id`. Endpoints *cannot* forget the check, because it runs before the handler does.

A wrong owner receives **404, not 403** — a 403 confirms the resource exists. `tests/test_isolation.py` is a seven-test regression suite against exactly this.

### Logs carry request IDs, never content

The outermost middleware assigns each request an ID and stores it in a `ContextVar`, so every log line and the 500 response body share it. A user can quote an ID and it maps to their exact request.

The access log records method, path, status, and duration only. Query strings stay out because `?q=diabetes` in a log file is a health disclosure. Bodies stay out because a body is a medical record.

`ContextVar` with raw ASGI middleware rather than `BaseHTTPMiddleware`: the latter breaks context propagation and streaming responses.

### Refresh tokens rotate

SHA-256 hashed (not bcrypt — a random 43-character secret does not need slow hashing), stored server-side, and deleted the moment they are used. A stolen token breaks the legitimate client's next refresh, which makes theft *detectable* rather than silent. The token travels in the request body rather than a header, because proxies log headers.

Login returns an identical response for a wrong password and an unknown email, and rate-limit 429s reveal nothing about account existence. Both are tested.

</details>

<details>
<summary><b>Data model and client architecture</b></summary>

### Users and patients are separate entities

Most people managing prescriptions carefully are doing it for a parent or a child. Splitting `User` (who authenticates) from `Patient` (whose records these are) supports family profiles without a painful migration later.

### `frequency_code` stores the raw notation

`"1-0-1"` is universal on Indian prescriptions and expands deterministically into a schedule. Storing the doctor's own notation means the app restates what was written rather than interpreting it — product rule 1 enforced at the schema level.

### Storage sits behind an interface

`StorageBackend` is abstract, with `save`, `load`, `delete`, and an optional `local_path`. Endpoints serve through `local_path` when the backend has one and stream from `load` otherwise, so neither the router nor the model knows which backend is live. Storage keys are opaque and never leave the server — clients receive a `has_thumbnail` boolean, not a key.

### Cache is invalidated, never patched

Timeline grouping depends on the exact row ordering (`visit_date DESC, created_at DESC`). Inserting a new record into the query cache by hand would mean reimplementing that sort client-side, and a backdated visit would land in the wrong section. Refetching sidesteps the problem entirely.

### Saving a visit tolerates partial failure

Create the prescription, store each page, add each medicine. If a page fails, the visit is still saved and the user is told exactly what did not land, with a retry that targets the existing record rather than creating a duplicate. The record is the thing worth keeping.

### Timeline previews come from one query

List rows carry a `thumbnail_attachment_id` computed by a correlated subquery picking the lowest-numbered page that has a preview. A join would multiply rows and break the count subqueries beside it; fetching detail per visible row would be N requests.

### Token refresh is single-flight

Concurrent requests that all expire at once share one refresh call. A request whose 401 arrives *after* another has already refreshed retries with the new token rather than rotating again — otherwise rotation invalidates the token the second refresh is about to use. Both races are covered by tests, because neither is reliably reproducible by hand.

</details>

---

## Stack

**App** — Expo · React Native · Expo Router · TanStack Query · expo-sqlite · expo-image-manipulator · TypeScript (strict) · Vitest

**Backend** — FastAPI · SQLAlchemy 2.0 (async) · Alembic · PostgreSQL · Pydantic v2 · slowapi · Pillow · pytest

**Infrastructure** — Docker (multi-stage, non-root) · Railway · GitHub Actions

---

## API

The optional cloud backend. All routes are prefixed `/api/v1`.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `POST` | `/auth/register` | Create account → `201 UserRead` |
| `POST` | `/auth/login` | OAuth2 form → access + refresh pair |
| `POST` | `/auth/refresh` | Rotate the refresh token → new pair |
| `POST` | `/auth/logout` | Revoke one refresh token → `204` |
| `POST` | `/auth/logout-all` | Revoke every session → `204` |
| `GET` | `/patients` | List family profiles |
| `POST` | `/patients` | Add a person → `201 PatientRead` |
| `GET` | `/prescriptions` | Timeline; filters `q`, `patient_id`, `doctor`, `clinic`, `date_from`, `date_to`; paginated |
| `POST` | `/prescriptions` | Record a visit → `201 PrescriptionRead` |
| `GET` | `/prescriptions/{id}` | One visit with attachments and medications |
| `PATCH` | `/prescriptions/{id}` | Partial update (`exclude_unset`) |
| `POST` | `/prescriptions/{id}/attachments` | Upload a scan — multipart, field `file` |
| `GET` | `/attachments/{id}/file` | Download the stored image |
| `GET` | `/attachments/{id}/thumbnail` | 400px preview; `404` for PDFs |
| `GET` | `/prescriptions/{id}/medications` | Medications from one visit |
| `POST` | `/prescriptions/{id}/medications` | Add a medication → `201 MedicationRead` |

Auth endpoints are rate limited per IP. Accepted uploads: JPEG, PNG, WebP, HEIC, PDF. Images are re-encoded to JPEG; PDFs pass through unchanged and have no thumbnail.

---

## Tests

```bash
# Backend
pytest --cov=app

# Client
cd client && npm test && npm run typecheck
```

CI runs three jobs on every pull request: lint, type check and test; an Alembic round-trip against a real PostgreSQL service (`upgrade head` → `downgrade base` → `upgrade head`); and the client type check and test suite.

The PostgreSQL job exists because SQLite silently drops timezone information, and a naive-versus-aware datetime comparison in refresh-token expiry only surfaces on a real database.

---

## Project layout

```text
prescription-vault/
├── app/                    # FastAPI backend (optional cloud tier)
│   ├── core/               # Config, security, logging, middleware, limiter
│   ├── models/             # SQLAlchemy models
│   ├── schemas/            # Pydantic request and response models
│   ├── services/           # Storage backends, image pipeline
│   └── api/                # Dependencies and versioned routers
├── alembic/                # Server migrations
├── tests/                  # Backend test suite
├── client/                 # Expo app
│   └── src/
│       ├── api/            # HTTP client, token storage (cloud tier only)
│       ├── app/            # Expo Router screens
│       ├── data/           # Repository interfaces + SQLite and HTTP impls
│       ├── db/             # Local schema, migrations, connection
│       ├── domain/         # Types the app speaks, independent of storage
│       ├── features/       # Feature components and pure helpers
│       ├── services/       # On-device image pipeline
│       ├── ui/             # Shared components
│       └── flags.ts        # CLOUD_ENABLED
├── Dockerfile              # Multi-stage, non-root, healthcheck
└── docker-compose.yml      # API + PostgreSQL
```

---

## Known limitations

Named deliberately rather than left to be discovered.

- **Android only.** iOS is planned but untested, and needs its own storage flagging: iOS may purge app storage under pressure if data is not marked as user data.
- **No editing yet.** A mistyped doctor name is currently permanent. The `PATCH` endpoints exist; the screens do not.
- **On-device EXIF stripping is unverified.** Re-encoding *should* drop GPS the way Pillow does, but the server path has a test that plants coordinates and asserts they are gone, and the device path does not yet.
- **No tests for the SQLite repositories.** They are the most important code in the app, and Vitest runs in a Node environment with no native modules available.
- **Single device.** No sync, no multi-device, no family sharing. Records live on one phone; losing it loses them.
- **Rate limiting is in-process and per-IP.** N workers permit N times the configured limit, and on carrier-grade NAT — common across Indian mobile networks — thousands of users share an address.
- **No data-protection review.** A DPDP Act 2023 review and a privacy policy are prerequisites before a Play Store listing.

---

## Roadmap

- **Editing and deletion** — amend a visit, remove a page, with the stored files cleaned up alongside the rows
- **PDF export and share** — send a visit through WhatsApp or the system share sheet. This answers the "a relative needs the records" case with no server at all.
- **Play Store release** — EAS build, privacy policy, data-safety declaration, DPDP review
- **Cloud backup tier** — flip `CLOUD_ENABLED`, adopt local records into an account, add a persistent outbox. Built only if in-app prompts show that people want it.
- **`prescan`** — a C++17 image preprocessing engine (Sauvola adaptive threshold, Hough deskew, page crop) to make a photographed prescription legible to a human at a pharmacy counter. Exposed to the backend through pybind11 and the app through WASM, with a libFuzzer harness, because image parsers are untrusted-input code.

---

## Disclaimer

Prescription Vault is a record-keeping tool, not a medical device.

It does not provide medical advice, drug interaction warnings, or dosage recommendations.
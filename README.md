# Prescription Vault

[![CI](https://github.com/Pratham-2105/prescription-vault/actions/workflows/ci.yml/badge.svg)](https://github.com/Pratham-2105/prescription-vault/actions/workflows/ci.yml)
[![Python 3.13](https://img.shields.io/badge/python-3.13-blue.svg)](https://www.python.org/)
[![TypeScript](https://img.shields.io/badge/typescript-strict-blue.svg)](https://www.typescriptlang.org/)
[![Platform](https://img.shields.io/badge/platform-Android-3ddc84.svg)](https://github.com/Pratham-2105/prescription-vault)

**Keep every prescription you have ever been given, on your phone, findable in seconds — with no account and no internet.**

Photograph a prescription, tag it with the doctor, clinic, and date, and it is there six months later when a new doctor asks what you were on. At a pharmacy counter with no signal. On a relative's phone while you are in hospital.

🔗 **[Live API + interactive docs](https://prescription-vault-production.up.railway.app/docs)** — the optional cloud backend, deployed on Railway with PostgreSQL

---

## The problem

Paper prescriptions get lost. Every new doctor asks what you were prescribed six months ago, and the honest answer is usually a shrug, or a photo buried somewhere in a camera roll of four thousand images.

Photo gallery apps do not solve this. A prescription is not a picture — it is a *visit*: a doctor, a clinic, a date, a reason, and a list of medicines, with the scan attached. That structure is what makes it searchable, and searchable is the whole point.

## Why it works offline

The two moments this app actually matters are a pharmacy counter with no signal, and a relative needing your records while you are in hospital. An app that needs a network round trip to display a prescription fails at exactly the moment it was built for.

So the phone holds the real copy. Everything — records, images, search — runs locally. The cloud backend exists and is deployed, but it is an optional backup target behind a build flag, not a dependency. **The app has no sign-in screen.**

## What it will not do

Three rules, held deliberately:

1. **Record-keeping, not medical advice.** No drug-interaction warnings, no dosage suggestions, ever. That is a liability line, not a missing feature.
2. **Nothing is inferred and saved silently.** Any extracted or suggested value is a draft you confirm. A misread dosage is the one bug that can physically hurt someone.
3. **Capture in under 30 seconds.** Photo, tagged, saved. That number is the product.

---

## Features

**Capture** — camera or gallery, multi-page visits, family profiles, medicines with Indian dosage notation (`1-0-1`), inline patient creation

**Find** — timeline grouped by visit date, page thumbnails, instant search across doctor, clinic, reason, and notes, filtering by family member

**Amend** — edit any visit, with a confirmation listing exactly which fields change before anything is written; delete a page or a medicine, with the stored files removed alongside the row

**Share** — export a visit as a PDF and send it through WhatsApp or any app on the share sheet. No server involved.

**Everything above works in airplane mode.** Verified on a physical Android device: created a visit with photos, switched to airplane mode, created another, restarted the app, and every record and image was intact — including the PDF export.

---

## Engineering

Built as a full stack and then deliberately inverted. The backend came first — FastAPI, PostgreSQL, JWT with rotating refresh tokens, deployed behind HTTPS with CI. Then the product direction changed to local-first, and **the entire data layer was swapped from HTTP to on-device SQLite without editing a single screen.**

That was not luck. Two decisions made weeks earlier paid for it: UUID primary keys, chosen so a client could mint valid IDs with no network, and a repository interface that screens talk to instead of HTTP.

**63 backend tests** at 83% coverage · **9 client tests** · three CI jobs, including an Alembic migration round-trip against real PostgreSQL

<details>
<summary><b>Local-first architecture</b></summary>

### The device owns the data

The phone mints UUIDs, assigns page numbers, sets timestamps, and processes images — all jobs the server used to do. A sequential integer primary key cannot be minted on a phone with no network, which is why the schema never used one.

### Screens talk to a repository, never to storage

Every screen reads and writes through a `PrescriptionRepository` interface. Two implementations exist — SQLite and HTTP — and one build flag decides which is constructed. Swapping the entire data layer changed no screen, which is the clearest evidence the boundary was drawn in the right place.

### Migrations are versioned from the first release

The local schema is tracked with SQLite's `user_version`, checked on open, with outstanding migrations applied one transaction each. Once a migration ships it is frozen: editing it would mean devices that already ran it never see the change while fresh installs get a different schema.

Cheap now. Impossible to retrofit safely once someone is holding two hundred prescriptions.

### Foreign keys are enabled explicitly

SQLite ships with `PRAGMA foreign_keys = OFF`, which makes every `ON DELETE CASCADE` in the schema decorative — deleting a prescription would silently leave its attachments behind forever. It is a per-connection setting, which is also why there is exactly one connection.

### No sync columns, no conflict resolution

`synced_at` and `deleted_at` are deliberately absent. Conflict resolution is the genuinely hard part of offline-first architecture, and it only exists when two devices can modify the same record. Shipping without accounts means one device and one writer, so there is nothing to resolve. That cost gets paid if and when a multi-device tier is worth building.

</details>

<details>
<summary><b>Handling medical data carefully</b></summary>

### Uploads are sanitised, never trusted

On the server the client-declared `content_type` is ignored entirely — it is an attacker-controlled string. File type comes from magic bytes, and a payload declaring itself a JPEG is rejected if its contents say otherwise.

Images are re-encoded through Pillow, which *is* the metadata strip: decode to pixels, write a fresh file, everything else is gone. **A prescription photo carries the GPS coordinates of the clinic where it was taken** — health data leaking through a field nobody looks at. A test plants real coordinates and asserts they are absent afterwards.

Dimensions are read from the file header before any pixels are decoded, because a small file can declare a hundred megapixels and a request size limit says nothing about decompressed size.

### An edit is confirmed field by field

Saving does not commit immediately. It diffs against the stored record and shows exactly what changes, old value struck through above the new one.

These are medical records. A one-tap save makes a mistyped date indistinguishable from a correct one until someone notices months later. Comparison is on the normalised value, so whitespace or an empty string over a `NULL` is not reported — a dialog that cries wolf teaches people to tap through it without reading.

### Deleting a record deletes its files

SQLite's cascade removes rows; nothing removes what is on disk. Deletion reads the paths, drops the row, then deletes the files — in that order, because the steps are not transactional together and the failure modes are not equally bad. An orphaned file wastes space. An orphaned row shows the user a page that will not load.

### Ownership checks live in one place

Every server route touching a resource declares a dependency like `OwnedPrescription`, which resolves the object through a join back to the owner. Endpoints *cannot* forget the check, because it runs before the handler does. A wrong owner receives **404, not 403** — a 403 confirms the resource exists. A seven-test suite guards exactly this.

### Logs carry request IDs, never content

The outermost middleware assigns each request an ID in a `ContextVar`, so every log line and the 500 response body share it. The access log records method, path, status, and duration only. Query strings stay out, because `?q=diabetes` in a log file is a health disclosure. Bodies stay out, because a body is a medical record.

</details>

<details>
<summary><b>Problems worth the writeup</b></summary>

### Native memory the garbage collector cannot see

A 2400px bitmap is roughly 23 MB of native memory behind a small JavaScript handle. Without an explicit `release()` in a `finally`, a few large photos in sequence exhaust memory on a mid-range device — the GC has no idea how much it is holding.

### Files go to permanent storage, never the cache

The image manipulator writes its output to the cache directory, which the OS may purge under storage pressure. For an app whose premise is "your prescriptions are safe here," that would be silent data loss, so processed files are moved into the document directory as a final step.

### Token refresh is single-flight

Four requests expiring at once would fire four refreshes, and rotation invalidates three of them — presenting to the user as a random logout mid-session. A second race: a request whose 401 arrives *after* another has already refreshed must retry with the new token rather than rotate again. Both are covered by tests, because neither is reproducible by hand.

### Saving a visit tolerates partial failure

Create the prescription, store each page, add each medicine. If a page fails, the visit is still saved and the user is told exactly what did not land, with a retry that targets the existing record rather than creating a duplicate. The record is the thing worth keeping.

### The cache is invalidated, never patched

Timeline grouping depends on exact row ordering (`visit_date DESC, created_at DESC`). Writing a new record into the query cache by hand would mean reimplementing that sort client-side, and a backdated visit would land in the wrong section. Refetching sidesteps it.

### PDF export, and the FileProvider that refused it

Images are embedded as base64 rather than linked: the print renderer runs in its own WebView and will not reliably follow a `file://` path out to app storage, even though `<Image>` accepts the same URI happily. Full resolution, not thumbnails, because a pharmacist has to read handwriting off the result.

The PDF is then shared from exactly where it was written. An earlier version renamed it so the recipient would see something readable instead of a UUID — and Android refused, because it hands files to other apps through a FileProvider registered for specific directories, and the renamed copy was not in one. The same constraint means PDF export cannot run under Expo Go at all.

</details>

---

## Stack

**App** — Expo · React Native · Expo Router · TanStack Query · expo-sqlite · expo-image-manipulator · expo-print · TypeScript (strict, `noUncheckedIndexedAccess`) · Vitest

**Backend** — FastAPI · SQLAlchemy 2.0 (async) · Alembic · PostgreSQL · Pydantic v2 · slowapi · Pillow · pytest

**Infrastructure** — Docker (multi-stage, non-root, healthcheck) · Railway · EAS Build · GitHub Actions

---

## Running it

### The app

```bash
git clone https://github.com/Pratham-2105/prescription-vault.git
cd prescription-vault/client
npm install
npx expo start
```

Scan the QR code with [Expo Go](https://expo.dev/go) on Android. No Android SDK and no backend needed — the app is self-contained.

> `npm run web` does not work (`expo-sqlite` needs a WASM worker Metro cannot resolve), and PDF export needs a development build rather than Expo Go — see the FileProvider note above.

### The backend

API, PostgreSQL, and migrations in one command:

```bash
docker compose up --build
```

Interactive docs at <http://localhost:8000/docs>. Migrations apply on container start and development values are supplied by compose, so no `.env` is needed locally.

<details>
<summary><b>Without Docker</b></summary>

```bash
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt

cp .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(48))"   # paste into JWT_SECRET

alembic upgrade head
uvicorn app.main:app --reload
```

</details>

### Tests

```bash
pytest --cov=app                              # backend
cd client && npm test && npm run typecheck    # client
```

CI runs three jobs per pull request: lint, type check and test; an Alembic round-trip (`upgrade head` → `downgrade base` → `upgrade head`) against a real PostgreSQL service; and the client suite. That PostgreSQL job exists because SQLite silently drops timezone information, and a naive-versus-aware datetime comparison in refresh-token expiry only surfaces on a real database.

---

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_CLOUD_ENABLED` | `false` | `true` restores the auth screens and switches the repositories to HTTP. One codebase, not two versions. |
| `EXPO_PUBLIC_API_URL` | localhost | API base URL, when the cloud tier is enabled |
| `JWT_SECRET` | *(required)* | Server refuses to start without it — fail-fast config, not a bug |
| `DATABASE_URL` | SQLite dev file | Normalised to the asyncpg driver if supplied as `postgresql://` |
| `STORAGE_BACKEND` | `local` | `local` or `r2` (S3-compatible object storage) |
| `STORAGE_DIR` | `./storage` | Must point at a mounted volume in production |
| `LOGIN_RATE_LIMIT` | `5/minute` | Per-IP; `REGISTER_`, `REFRESH_`, `LOGOUT_` equivalents exist |

---

## API

The optional cloud backend, prefixed `/api/v1`.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `POST` | `/auth/register` | Create account → `201 UserRead` |
| `POST` | `/auth/login` | OAuth2 form → access + refresh pair |
| `POST` | `/auth/refresh` | Rotate the refresh token → new pair |
| `POST` | `/auth/logout` · `/auth/logout-all` | Revoke one session or all → `204` |
| `GET` · `POST` | `/patients` | List or add a family profile |
| `GET` | `/prescriptions` | Timeline; filters `q`, `patient_id`, `doctor`, `clinic`, `date_from`, `date_to`; paginated |
| `POST` | `/prescriptions` | Record a visit → `201 PrescriptionRead` |
| `GET` · `PATCH` · `DELETE` | `/prescriptions/{id}` | One visit with attachments and medications |
| `POST` | `/prescriptions/{id}/attachments` | Upload a scan — multipart, field `file` |
| `GET` | `/attachments/{id}/file` · `/thumbnail` | Full image, or 400px preview (`404` for PDFs) |
| `DELETE` | `/attachments/{id}` | Remove one page |
| `GET` · `POST` | `/prescriptions/{id}/medications` | List or add medications |
| `PATCH` · `DELETE` | `/medications/{id}` | Amend or remove one |

Auth endpoints are rate limited per IP. Accepted uploads: JPEG, PNG, WebP, HEIC, PDF. Images are re-encoded to JPEG; PDFs pass through unchanged and have no thumbnail.

---

## Project layout

```text
prescription-vault/
├── app/                    # FastAPI backend (optional cloud tier)
│   ├── core/               # Config, security, logging, middleware, limiter
│   ├── models/  schemas/   # SQLAlchemy models · Pydantic request/response
│   ├── services/           # Storage backends, image pipeline
│   └── api/                # Dependencies and versioned routers
├── alembic/                # Server migrations
├── tests/                  # Backend test suite
├── docs/                   # Privacy policy, served by GitHub Pages
├── client/src/
│   ├── app/                # Expo Router screens
│   ├── data/               # Repository interfaces + SQLite and HTTP impls
│   ├── db/                 # Local schema, migrations, connection
│   ├── domain/             # Types the app speaks, independent of storage
│   ├── features/           # Feature components and pure helpers
│   ├── services/           # On-device image pipeline, PDF export
│   └── flags.ts            # CLOUD_ENABLED
├── Dockerfile              # Multi-stage, non-root, healthcheck
└── docker-compose.yml      # API + PostgreSQL
```

---

## Known limitations

Named deliberately rather than left to be discovered.

- **Android only.** iOS is planned but untested, and needs its own storage flagging — iOS may purge app storage under pressure if data is not marked as user data.
- **Single device.** No sync, no family sharing. Records live on one phone; losing it loses them. The paid cloud tier is where that changes.
- **No tests for the SQLite repositories.** They are now the most important code in the app, and Vitest runs in a Node environment with no native modules available.
- **Exported PDFs arrive with a generated filename**, and a PDF attached to a visit is skipped rather than merged into the export.
- **Rate limiting is in-process and per-IP.** N workers permit N times the configured limit, and on carrier-grade NAT — common across Indian mobile networks — thousands of users share an address.

---

## Roadmap

- **Play Store release** — data-safety declaration, DPDP Act 2023 review
- **Doctor and clinic autocomplete** from local history, to shave seconds off capture
- **Cloud backup tier** — flip `CLOUD_ENABLED`, adopt local records into an account, add a persistent outbox. Built only if in-app prompts show people want it.
- **`prescan`** — a C++17 image preprocessing engine (Sauvola adaptive threshold, Hough deskew, page crop) to make a photographed prescription legible to a human at a pharmacy counter. Exposed to the backend through pybind11 and the app through WASM, with a libFuzzer harness, because image parsers are untrusted-input code.

---

## Privacy

No accounts, no analytics, no telemetry, no third-party services, and no network calls in normal use. Records never leave the device unless you export one yourself.

Full policy: [Privacy Policy](https://pratham-2105.github.io/prescription-vault/privacy.html)

---

## Disclaimer

Prescription Vault is a record-keeping tool, not a medical device. It does not provide medical advice, drug interaction warnings, or dosage recommendations.
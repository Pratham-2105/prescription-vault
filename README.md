# Prescription Vault

A backend for storing and organising medical prescriptions. Users photograph
or upload prescriptions, tag them with doctor, clinic, and visit date, and
retrieve them later — including the medications and dosage schedules from
each visit.

Built to solve a specific problem: paper prescriptions get lost, and the
"what was I prescribed six months ago" question comes up at every new
doctor's appointment.

## Stack

- **FastAPI** — async API with OpenAPI docs generated from type hints
- **SQLAlchemy 2.0** (async) + **Alembic** — ORM and versioned migrations
- **PostgreSQL** in production, SQLite for local development
- **JWT** authentication, bcrypt password hashing
- **pytest** — 33 tests, 83% coverage

## Design decisions

**Users and patients are separate entities.** Most people managing
prescriptions carefully are doing it for a parent or child. Splitting
`User` (who authenticates) from `Patient` (whose records these are)
supports family profiles without a painful migration later.

**UUID primary keys.** The mobile client is offline-first and must be able
to create records with valid IDs before reaching the server. Sequential
integers can't do that.

**Ownership checks live in one place.** Every route that touches a resource
declares a dependency like `OwnedPrescription`, which resolves the object
via a join back to `Patient.owner_id`. Endpoints cannot forget the check
because it runs before the handler does. `tests/test_isolation.py` covers
this as a regression suite.

**Storage is behind an interface.** `StorageBackend` is abstract; local
disk today, S3-compatible object storage in production, with no changes
outside the service layer.

## Running locally

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

## Tests

```bash
pytest --cov=app
```

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/auth/register` | Create account |
| POST | `/api/v1/auth/login` | Obtain JWT |
| GET | `/api/v1/patients` | List family profiles |
| POST | `/api/v1/prescriptions` | Record a visit |
| GET | `/api/v1/prescriptions` | Timeline, filtered and paginated |
| POST | `/api/v1/prescriptions/{id}/attachments` | Upload a scan |
| POST | `/api/v1/prescriptions/{id}/medications` | Add prescribed medication |

## Roadmap

- [ ] Refresh token rotation
- [ ] Image pipeline: EXIF stripping, re-encoding, thumbnails
- [ ] OCR-assisted extraction with user confirmation before saving
- [ ] Dose scheduling and reminders
- [ ] Mobile client (Expo) with offline-first sync

## Disclaimer

A record-keeping tool, not a medical device. It does not provide medical
advice, drug interaction warnings, or dosage recommendations.
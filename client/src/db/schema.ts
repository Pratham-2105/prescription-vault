/**
 * The on-device schema.
 *
 * Mirrors the SQLAlchemy models in app/models/, with the differences the
 * platform forces:
 *
 *   - No `users` table. The local app has no accounts, so patients have no
 *     owner. Ownership is established at sync time, if a cloud tier ever ships.
 *   - UUIDs are TEXT. SQLite has no UUID type; the device mints them.
 *   - Dates and timestamps are TEXT. 'YYYY-MM-DD' for calendar dates, ISO-8601
 *     UTC for instants. Both sort lexicographically in chronological order,
 *     which is what keeps `ORDER BY visit_date DESC` correct without parsing.
 *   - Booleans are INTEGER 0/1.
 *   - Attachments store a filesystem URI, not a server storage key.
 *
 * Deliberately absent: sync columns (synced_at, deleted_at). They are only
 * needed for the cloud tier. Adding a migration later is what the runner below
 * is for; adding speculative columns now is not.
 */

export type Migration = {
  /** The `user_version` this migration brings the database TO. Starts at 1. */
  version: number;
  /** A short note for the log — not used by the runner beyond that. */
  label: string;
  /**
   * Statements applied in order, inside one transaction.
   *
   * Once a migration has shipped it is FROZEN. Editing it means devices that
   * already ran it never see the change, while fresh installs get a different
   * schema — two populations with silently different databases. Add a new
   * migration instead.
   */
  statements: string[];
};

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    label: 'initial schema',
    statements: [
      `CREATE TABLE patients (
        id            TEXT PRIMARY KEY NOT NULL,
        display_name  TEXT NOT NULL,
        relation      TEXT,
        date_of_birth TEXT,
        blood_group   TEXT,
        allergies     TEXT,
        notes         TEXT,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      )`,

      `CREATE TABLE prescriptions (
        id          TEXT PRIMARY KEY NOT NULL,
        patient_id  TEXT NOT NULL
                    REFERENCES patients(id) ON DELETE CASCADE,
        visit_date  TEXT NOT NULL,
        doctor_name TEXT,
        clinic_name TEXT,
        specialty   TEXT,
        reason      TEXT,
        notes       TEXT,
        -- Reserved. OCR is cut, but the columns cost nothing and keep the
        -- door open. Mirrors the server schema.
        ocr_status  TEXT NOT NULL DEFAULT 'skipped',
        ocr_text    TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )`,

      `CREATE TABLE attachments (
        id                TEXT PRIMARY KEY NOT NULL,
        prescription_id   TEXT NOT NULL
                          REFERENCES prescriptions(id) ON DELETE CASCADE,
        -- file:// URI in the app's document directory. The row is metadata;
        -- the bytes live on the filesystem, so the image loader reads them
        -- directly instead of pulling megabytes through a query.
        local_uri         TEXT NOT NULL,
        -- Null for PDFs, which have no preview — same rule as the server.
        thumbnail_uri     TEXT,
        original_filename TEXT,
        content_type      TEXT NOT NULL,
        size_bytes        INTEGER NOT NULL,
        page_number       INTEGER NOT NULL DEFAULT 1,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL
      )`,

      `CREATE TABLE medications (
        id              TEXT PRIMARY KEY NOT NULL,
        prescription_id TEXT NOT NULL
                        REFERENCES prescriptions(id) ON DELETE CASCADE,
        name            TEXT NOT NULL,
        strength        TEXT,
        form            TEXT,
        -- Raw doctor notation, e.g. "1-0-1". Format it, never interpret it.
        frequency_code  TEXT,
        food_relation   TEXT,
        duration_days   INTEGER,
        start_date      TEXT,
        instructions    TEXT,
        is_active       INTEGER NOT NULL DEFAULT 1,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      )`,

      // Mirrors the server's indexes. The composite one matches the timeline's
      // exact ordering (visit_date DESC, created_at DESC), so the list query
      // reads straight off the index with no sort step.
      `CREATE INDEX idx_prescriptions_patient ON prescriptions(patient_id)`,
      `CREATE INDEX idx_prescriptions_timeline
         ON prescriptions(visit_date DESC, created_at DESC)`,
      `CREATE INDEX idx_prescriptions_doctor ON prescriptions(doctor_name)`,
      `CREATE INDEX idx_prescriptions_clinic ON prescriptions(clinic_name)`,

      // Attachments are read by prescription and ordered by page. One index
      // covers both.
      `CREATE INDEX idx_attachments_prescription
         ON attachments(prescription_id, page_number)`,

      `CREATE INDEX idx_medications_prescription
         ON medications(prescription_id)`,
    ],
  },
  {
    version: 2,
    label: 'app preferences',
    statements: [
      // A key/value table rather than columns on a settings row: preferences
      // are sparse, unrelated to each other, and adding one should not need a
      // schema change. Reading an absent key means "not set", which is the
      // default for every flag here.
      `CREATE TABLE preferences (
        key        TEXT PRIMARY KEY NOT NULL,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ],
  },
];

/** The version a fresh install ends up at. */
export const LATEST_VERSION: number = MIGRATIONS.reduce(
  (highest, migration) => Math.max(highest, migration.version),
  0,
);
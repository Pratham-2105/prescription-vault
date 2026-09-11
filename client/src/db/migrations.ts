/**
 * The local SQLite schema, as an ordered list of versions.
 *
 * Rules for adding to this file:
 *   1. NEVER edit a migration that has shipped. A user on version 2 will
 *      never re-run migration 2; editing it only changes what fresh installs
 *      get, and the two populations silently diverge.
 *   2. Append a new entry with `version` exactly one higher than the last.
 *   3. `statements` is one SQL statement per array element. The runner
 *      executes them in order inside a single transaction.
 */

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly statements: readonly string[];
}

const V1_INITIAL_SCHEMA: Migration = {
  version: 1,
  name: 'initial schema',
  statements: [
    `CREATE TABLE patients (
       id            TEXT    NOT NULL PRIMARY KEY,
       name          TEXT    NOT NULL,
       relation      TEXT,
       date_of_birth TEXT             CHECK (date_of_birth IS NULL OR date_of_birth LIKE '____-__-__'),
       notes         TEXT,
       created_at    TEXT    NOT NULL,
       updated_at    TEXT    NOT NULL
     ) STRICT`,

    `CREATE TABLE prescriptions (
       id          TEXT    NOT NULL PRIMARY KEY,
       patient_id  TEXT    NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
       visit_date  TEXT    NOT NULL CHECK (visit_date LIKE '____-__-__'),
       doctor_name TEXT,
       clinic_name TEXT,
       specialty   TEXT,
       reason      TEXT,
       notes       TEXT,
       ocr_status  TEXT    NOT NULL DEFAULT 'skipped'
                           CHECK (ocr_status IN ('pending', 'done', 'failed', 'skipped')),
       ocr_text    TEXT,
       created_at  TEXT    NOT NULL,
       updated_at  TEXT    NOT NULL
     ) STRICT`,

    `CREATE TABLE attachments (
       id              TEXT    NOT NULL PRIMARY KEY,
       prescription_id TEXT    NOT NULL REFERENCES prescriptions (id) ON DELETE CASCADE,
       storage_key     TEXT    NOT NULL,
       thumbnail_key   TEXT,
       content_type    TEXT    NOT NULL,
       size_bytes      INTEGER NOT NULL CHECK (size_bytes >= 0),
       page_number     INTEGER NOT NULL CHECK (page_number >= 1),
       created_at      TEXT    NOT NULL,
       updated_at      TEXT    NOT NULL,
       UNIQUE (prescription_id, page_number)
     ) STRICT`,

    `CREATE TABLE medications (
       id              TEXT    NOT NULL PRIMARY KEY,
       prescription_id TEXT    NOT NULL REFERENCES prescriptions (id) ON DELETE CASCADE,
       name            TEXT    NOT NULL,
       strength        TEXT,
       form            TEXT,
       frequency_code  TEXT,
       food_relation   TEXT             CHECK (food_relation IS NULL OR food_relation IN
                                          ('before_food', 'after_food', 'with_food', 'any')),
       duration_days   INTEGER          CHECK (duration_days IS NULL OR duration_days >= 0),
       start_date      TEXT             CHECK (start_date IS NULL OR start_date LIKE '____-__-__'),
       instructions    TEXT,
       is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
       created_at      TEXT    NOT NULL,
       updated_at      TEXT    NOT NULL
     ) STRICT`,

    // Mirrors the timeline's ORDER BY exactly, patient filter included.
    `CREATE INDEX idx_prescriptions_timeline
       ON prescriptions (patient_id, visit_date DESC, created_at DESC)`,

    `CREATE INDEX idx_medications_prescription
       ON medications (prescription_id)`,
  ],
};

export const MIGRATIONS: readonly Migration[] = [V1_INITIAL_SCHEMA];
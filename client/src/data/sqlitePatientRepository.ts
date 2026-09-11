import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabase } from '@/db/database';
import { newId, nowIso } from '@/db/ids';
import type { NewPatient, Patient } from '@/domain/patient';
import type { PatientRepository } from './patientRepository';

/**
 * A patients row as SQLite returns it.
 *
 * Declared separately from the domain type because the shapes genuinely
 * differ: snake_case, and every nullable column arrives as `string | null`
 * rather than being absent. Mapping in one place keeps that difference from
 * leaking into screens — the same job ApiPatientRepository does for the wire
 * format.
 */
type PatientRow = {
  id: string;
  display_name: string;
  relation: string | null;
  date_of_birth: string | null;
  blood_group: string | null;
  allergies: string | null;
  notes: string | null;
  created_at: string;
};

function toDomain(row: PatientRow): Patient {
  return {
    id: row.id,
    displayName: row.display_name,
    relation: row.relation,
    dateOfBirth: row.date_of_birth,
    bloodGroup: row.blood_group,
    allergies: row.allergies,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

/** Blank input is an absent value, not an empty string. */
function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export class SqlitePatientRepository implements PatientRepository {
  /**
   * The `signal` parameter from the interface is omitted rather than accepted
   * and ignored. TypeScript lets an implementation take fewer parameters than
   * its interface declares, and a local query has nothing to cancel — so
   * leaving it out is more honest than an unused argument the linter would
   * rightly flag. (Java would not allow this; structural typing does.)
   */
  async list(): Promise<Patient[]> {
    const db = await getDatabase();

    // Oldest first, so the account holder's own profile keeps the leftmost
    // chip position and the row never reshuffles between renders.
    const rows = await db.getAllAsync<PatientRow>(
      `SELECT id, display_name, relation, date_of_birth, blood_group,
              allergies, notes, created_at
         FROM patients
        ORDER BY created_at ASC`,
    );

    return rows.map(toDomain);
  }

  async create(input: NewPatient): Promise<Patient> {
    const db = await getDatabase();

    const row: PatientRow = {
      id: newId(),
      display_name: input.displayName.trim(),
      relation: emptyToNull(input.relation),
      date_of_birth: null,
      blood_group: null,
      allergies: null,
      notes: null,
      created_at: nowIso(),
    };

    await insertPatient(db, row);

    // Returned from the values just written rather than read back with a
    // second SELECT: the row is fully known here, and a round trip would only
    // confirm what we already inserted.
    return toDomain(row);
  }
}

async function insertPatient(db: SQLiteDatabase, row: PatientRow): Promise<void> {
  // Bound parameters, never string interpolation. The same reason the backend
  // lets SQLAlchemy build its queries: a display name containing a quote
  // should be a name, not syntax.
  await db.runAsync(
    `INSERT INTO patients
       (id, display_name, relation, date_of_birth, blood_group,
        allergies, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.display_name,
      row.relation,
      row.date_of_birth,
      row.blood_group,
      row.allergies,
      row.notes,
      row.created_at,
      row.created_at,
    ],
  );
}
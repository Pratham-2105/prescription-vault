import type { NewPatient, Patient } from '@/domain/patient';

/**
 * The only way screens reach patient data.
 *
 * Implementations:
 *   ApiPatientRepository     — HTTP (now)
 *   SqlitePatientRepository  — local DB + outbox (Phase C)
 *
 * `create` is the first write method in the codebase. Phase C intercepts
 * exactly this signature: the SQLite implementation will write locally,
 * enqueue an outbox entry, and return the local row — same return type, so
 * no screen changes.
 */
export interface PatientRepository {
  list(signal?: AbortSignal): Promise<Patient[]>;
  create(input: NewPatient, signal?: AbortSignal): Promise<Patient>;
}
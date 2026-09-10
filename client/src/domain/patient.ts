import type { IsoDate } from './prescription';

/**
 * A person whose prescriptions are being recorded: the account holder, a
 * parent, a child. Distinct from User — one account, many patients
 * (backend decision §5.1).
 *
 * owner_id is deliberately absent. It is always the signed-in user, so it
 * carries no information the client can act on, and leaving it out keeps the
 * domain type free of server-side bookkeeping.
 */
export type Patient = {
  id: string;
  displayName: string;
  relation: string | null;
  dateOfBirth: IsoDate | null;
  bloodGroup: string | null;
  allergies: string | null;
  notes: string | null;
  /** Kept only to give the patient list a stable order. */
  createdAt: string;
};

/** What the user supplies when adding someone. Only a name is required. */
export type NewPatient = {
  displayName: string;
  relation?: string | null;
};
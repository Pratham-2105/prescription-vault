import type { Prescription, PrescriptionEdit } from '@/domain/prescription';
import { formatVisitDate } from './groupByVisitDate';

/** One field the user actually changed. */
export type FieldChange = {
  label: string;
  /** What it was, or null when the field was empty. */
  before: string | null;
  /** What it will become, or null when the user cleared it. */
  after: string | null;
};

type FieldSpec = {
  key: keyof PrescriptionEdit;
  label: string;
  /** How to render the stored value for a human. Identity unless given. */
  format?: (value: string) => string;
};

/**
 * Field order matches the form, so the confirmation reads top to bottom the
 * same way the screen does.
 */
const FIELDS: FieldSpec[] = [
  { key: 'visitDate', label: 'Visit date', format: formatVisitDate },
  { key: 'doctorName', label: 'Doctor' },
  { key: 'clinicName', label: 'Clinic' },
  { key: 'specialty', label: 'Specialty' },
  { key: 'reason', label: 'Reason' },
  { key: 'notes', label: 'Notes' },
];

/**
 * Lists what would change if `edited` were saved over `original`.
 *
 * An empty array means nothing changed — the caller should skip the
 * confirmation and the write entirely rather than showing an empty dialog.
 *
 * Comparison is on the normalised value, not the raw input. A trailing space
 * or a field emptied to "" is not a change to a record that already held null,
 * and asking someone to confirm a change that is not a change trains them to
 * tap through the dialog without reading it.
 */
export function describeChanges(
  original: Prescription,
  edited: PrescriptionEdit,
): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const field of FIELDS) {
    const before = normalise(original[field.key]);
    const after = normalise(edited[field.key]);

    if (before === after) continue;

    changes.push({
      label: field.label,
      before: before === null ? null : present(before, field),
      after: after === null ? null : present(after, field),
    });
  }

  return changes;
}

/** Trimmed, with empty treated as absent — the same rule the repository uses. */
function normalise(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function present(value: string, field: FieldSpec): string {
  return field.format ? field.format(value) : value;
}
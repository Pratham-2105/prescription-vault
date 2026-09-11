import type { PickedFile } from '@/api/upload';
import { getDatabase } from '@/db/database';
import { newId, nowIso } from '@/db/ids';
import type {
  Attachment,
  Medication,
  NewMedication,
  NewPrescription,
  Page,
  Prescription,
  PrescriptionListItem,
} from '@/domain/prescription';
import { deleteAttachmentFiles, processPickedFile } from '@/services/imagePipeline';
import type {
  ImageVariant,
  ListPrescriptionsArgs,
  PrescriptionRepository,
} from './prescriptionRepository';

// ------------------------------------------------------------------ row types

type ListRow = {
  id: string;
  patient_id: string;
  visit_date: string;
  doctor_name: string | null;
  clinic_name: string | null;
  reason: string | null;
  attachment_count: number;
  medication_count: number;
  thumbnail_attachment_id: string | null;
};

type PrescriptionRow = {
  id: string;
  patient_id: string;
  visit_date: string;
  doctor_name: string | null;
  clinic_name: string | null;
  specialty: string | null;
  reason: string | null;
  notes: string | null;
};

type AttachmentRow = {
  id: string;
  page_number: number;
  content_type: string;
  size_bytes: number;
  thumbnail_uri: string | null;
};

type MedicationRow = {
  id: string;
  name: string;
  strength: string | null;
  form: string | null;
  frequency_code: string | null;
  food_relation: string | null;
  duration_days: number | null;
  start_date: string | null;
  is_active: number;
};

// -------------------------------------------------------------------- mapping

function listRowToDomain(row: ListRow): PrescriptionListItem {
  return {
    id: row.id,
    patientId: row.patient_id,
    visitDate: row.visit_date,
    doctorName: row.doctor_name,
    clinicName: row.clinic_name,
    reason: row.reason,
    attachmentCount: row.attachment_count,
    medicationCount: row.medication_count,
    thumbnailAttachmentId: row.thumbnail_attachment_id,
  };
}

function attachmentRowToDomain(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    pageNumber: row.page_number,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    // Mirrors the server's derived property: the URI stays internal, the
    // boolean is what screens get.
    hasThumbnail: row.thumbnail_uri !== null,
  };
}

function medicationRowToDomain(row: MedicationRow): Medication {
  return {
    id: row.id,
    name: row.name,
    strength: row.strength,
    form: row.form,
    frequencyCode: row.frequency_code,
    foodRelation: row.food_relation,
    durationDays: row.duration_days,
    startDate: row.start_date,
    // SQLite has no boolean type; 0/1 comes back as a number.
    isActive: row.is_active === 1,
  };
}

/** Blank input is an absent value, not an empty string. */
function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// ----------------------------------------------------------------- repository

export class SqlitePrescriptionRepository implements PrescriptionRepository {
  async list({
    limit,
    offset,
    ...filters
  }: ListPrescriptionsArgs): Promise<Page<PrescriptionListItem>> {
    const db = await getDatabase();

    // Built twice with different aliases: the count query has one table and
    // needs none, the row query aliases prescriptions as `p` so the correlated
    // subqueries below can reference their own tables unambiguously.
    const countFilter = buildFilters(filters, '');
    const rowFilter = buildFilters(filters, 'p');

    // Two queries rather than a window function: the timeline needs `total` to
    // know when to stop paging, and SQLite has no cheap way to get it
    // alongside a LIMIT. Both hit the same index, and on a local database the
    // second query costs microseconds.
    const totals = await db.getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) AS total FROM prescriptions ${countFilter.clause}`,
      countFilter.params,
    );

    const rows = await db.getAllAsync<ListRow>(
      `SELECT p.id, p.patient_id, p.visit_date, p.doctor_name, p.clinic_name, p.reason,
              (SELECT COUNT(*) FROM attachments a WHERE a.prescription_id = p.id)
                AS attachment_count,
              (SELECT COUNT(*) FROM medications m WHERE m.prescription_id = p.id)
                AS medication_count,
              -- Lowest-numbered page that has a preview. Correlated subquery
              -- rather than a join, for the same reason as the server: a join
              -- would multiply rows and break the counts above.
              (SELECT a.id FROM attachments a
                WHERE a.prescription_id = p.id AND a.thumbnail_uri IS NOT NULL
                ORDER BY a.page_number
                LIMIT 1) AS thumbnail_attachment_id
         FROM prescriptions p
         ${rowFilter.clause}
        ORDER BY p.visit_date DESC, p.created_at DESC
        LIMIT ? OFFSET ?`,
      [...rowFilter.params, limit, offset],
    );

    return {
      items: rows.map(listRowToDomain),
      total: totals?.total ?? 0,
      limit,
      offset,
    };
  }

  async getById(id: string): Promise<Prescription> {
    const db = await getDatabase();

    const row = await db.getFirstAsync<PrescriptionRow>(
      `SELECT id, patient_id, visit_date, doctor_name, clinic_name,
              specialty, reason, notes
         FROM prescriptions
        WHERE id = ?`,
      [id],
    );

    if (!row) {
      // Same shape of failure the HTTP repository produces on a 404, so the
      // detail screen's error branch behaves identically either way.
      throw new Error('That prescription no longer exists.');
    }

    const attachments = await db.getAllAsync<AttachmentRow>(
      `SELECT id, page_number, content_type, size_bytes, thumbnail_uri
         FROM attachments
        WHERE prescription_id = ?
        ORDER BY page_number`,
      [id],
    );

    return {
      id: row.id,
      patientId: row.patient_id,
      visitDate: row.visit_date,
      doctorName: row.doctor_name,
      clinicName: row.clinic_name,
      specialty: row.specialty,
      reason: row.reason,
      notes: row.notes,
      attachments: attachments.map(attachmentRowToDomain),
    };
  }

  async listMedications(prescriptionId: string): Promise<Medication[]> {
    const db = await getDatabase();

    const rows = await db.getAllAsync<MedicationRow>(
      `SELECT id, name, strength, form, frequency_code, food_relation,
              duration_days, start_date, is_active
         FROM medications
        WHERE prescription_id = ?
        ORDER BY created_at ASC`,
      [prescriptionId],
    );

    return rows.map(medicationRowToDomain);
  }

  /**
   * Returns a URI the image loader can render.
   *
   * Over HTTP this had to fetch the bytes and base64-encode them, because an
   * <Image> source cannot carry a bearer token. Locally the file is already a
   * file:// URI the loader reads directly — no encoding, no copy in memory,
   * and a full-size page costs no more than a thumbnail to hand over.
   */
  async fetchAttachmentImage(attachmentId: string, variant: ImageVariant): Promise<string> {
    const db = await getDatabase();

    const row = await db.getFirstAsync<{
      local_uri: string;
      thumbnail_uri: string | null;
    }>(`SELECT local_uri, thumbnail_uri FROM attachments WHERE id = ?`, [attachmentId]);

    if (!row) throw new Error('That page is no longer stored on this device.');

    if (variant === 'thumbnail') {
      if (!row.thumbnail_uri) throw new Error('This file has no preview.');
      return row.thumbnail_uri;
    }
    return row.local_uri;
  }

  // ------------------------------------------------------------------ writes

  async create(input: NewPrescription): Promise<Prescription> {
    const db = await getDatabase();

    const id = newId();
    const timestamp = nowIso();

    await db.runAsync(
      `INSERT INTO prescriptions
         (id, patient_id, visit_date, doctor_name, clinic_name, specialty,
          reason, notes, ocr_status, ocr_text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'skipped', NULL, ?, ?)`,
      [
        id,
        input.patientId,
        input.visitDate,
        emptyToNull(input.doctorName),
        emptyToNull(input.clinicName),
        emptyToNull(input.specialty),
        emptyToNull(input.reason),
        emptyToNull(input.notes),
        timestamp,
        timestamp,
      ],
    );

    return this.getById(id);
  }

  async uploadAttachment(prescriptionId: string, file: PickedFile): Promise<Attachment> {
    const db = await getDatabase();

    const id = newId();
    // Processing happens before the insert so a failure leaves no row
    // pointing at bytes that were never written.
    const processed = await processPickedFile(file, id);

    try {
      // Page numbering moves to the device. The server assigned it in arrival
      // order; here the next number comes from what is already stored.
      const highest = await db.getFirstAsync<{ page: number | null }>(
        `SELECT MAX(page_number) AS page FROM attachments WHERE prescription_id = ?`,
        [prescriptionId],
      );
      const pageNumber = (highest?.page ?? 0) + 1;

      const timestamp = nowIso();
      await db.runAsync(
        `INSERT INTO attachments
           (id, prescription_id, local_uri, thumbnail_uri, original_filename,
            content_type, size_bytes, page_number, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          prescriptionId,
          processed.localUri,
          processed.thumbnailUri,
          emptyToNull(file.name),
          processed.contentType,
          processed.sizeBytes,
          pageNumber,
          timestamp,
          timestamp,
        ],
      );

      return {
        id,
        pageNumber,
        contentType: processed.contentType,
        sizeBytes: processed.sizeBytes,
        hasThumbnail: processed.thumbnailUri !== null,
      };
    } catch (error) {
      // The filesystem and the database are not transactional together — the
      // same problem the upload endpoint solves on the server. If the row
      // fails to insert, the bytes on disk are orphaned, so remove them.
      deleteAttachmentFiles(processed);
      throw error;
    }
  }

  async addMedication(prescriptionId: string, input: NewMedication): Promise<Medication> {
    const db = await getDatabase();

    const id = newId();
    const timestamp = nowIso();
    const name = input.name.trim();

    await db.runAsync(
      `INSERT INTO medications
         (id, prescription_id, name, strength, form, frequency_code,
          food_relation, duration_days, start_date, instructions,
          is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)`,
      [
        id,
        prescriptionId,
        name,
        emptyToNull(input.strength),
        emptyToNull(input.form),
        emptyToNull(input.frequencyCode),
        input.foodRelation ?? null,
        input.durationDays ?? null,
        input.startDate ?? null,
        timestamp,
        timestamp,
      ],
    );

    return {
      id,
      name,
      strength: emptyToNull(input.strength),
      form: emptyToNull(input.form),
      frequencyCode: emptyToNull(input.frequencyCode),
      foodRelation: input.foodRelation ?? null,
      durationDays: input.durationDays ?? null,
      startDate: input.startDate ?? null,
      isActive: true,
    };
  }
}

// -------------------------------------------------------------------- filters

type FilterValue = string | number | null;

/** Character LIKE patterns use to escape their own wildcards. */
const LIKE_ESCAPE = '\\';

/**
 * Builds the WHERE clause from whichever filters are present.
 *
 * `alias` qualifies the column names. The row query aliases prescriptions as
 * `p` and joins nothing, but its correlated subqueries reference their own
 * tables, so unqualified column names would be ambiguous. The count query has
 * one table and passes an empty alias.
 *
 * Values are always bound, never interpolated — a search for O'Brien is a
 * name, not a syntax error. This mirrors what the server's SQLAlchemy query
 * does with the same filter set.
 */
function buildFilters(
  filters: Omit<ListPrescriptionsArgs, 'limit' | 'offset' | 'signal'>,
  alias: string,
): { clause: string; params: FilterValue[] } {
  const prefix = alias ? `${alias}.` : '';
  const conditions: string[] = [];
  const params: FilterValue[] = [];

  if (filters.patientId) {
    conditions.push(`${prefix}patient_id = ?`);
    params.push(filters.patientId);
  }
  if (filters.doctor) {
    conditions.push(like(`${prefix}doctor_name`));
    params.push(contains(filters.doctor));
  }
  if (filters.clinic) {
    conditions.push(like(`${prefix}clinic_name`));
    params.push(contains(filters.clinic));
  }
  if (filters.dateFrom) {
    // String comparison is correct here: 'YYYY-MM-DD' sorts lexicographically
    // in the same order it sorts chronologically. That is the whole reason
    // ISO 8601 puts the fields in that order.
    conditions.push(`${prefix}visit_date >= ?`);
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push(`${prefix}visit_date <= ?`);
    params.push(filters.dateTo);
  }
  if (filters.q) {
    conditions.push(
      `(${like(`${prefix}doctor_name`)} OR ${like(`${prefix}clinic_name`)}` +
        ` OR ${like(`${prefix}reason`)} OR ${like(`${prefix}notes`)})`,
    );
    const pattern = contains(filters.q);
    params.push(pattern, pattern, pattern, pattern);
  }

  return {
    clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

/**
 * A LIKE comparison with the escape character declared.
 *
 * SQLite ignores backslashes in a pattern unless ESCAPE says otherwise, so
 * without this the escaping in contains() would insert characters that match
 * literally and make things worse rather than better.
 */
function like(column: string): string {
  return `${column} LIKE ? ESCAPE '${LIKE_ESCAPE}'`;
}

/**
 * A pattern matching the term anywhere in the column.
 *
 * SQLite's LIKE is case-insensitive for ASCII by default, which is close
 * enough to the server's ILIKE for doctor and clinic names. The escaping
 * matters because % and _ are wildcards: searching for "50%" should find that
 * text, not every row in the database.
 */
function contains(term: string): string {
  const escaped = term.replace(/[\\%_]/g, (character) => `${LIKE_ESCAPE}${character}`);
  return `%${escaped}%`;
}
/** A visit date in 'YYYY-MM-DD'. Never a Date object — see groupByVisitDate.ts. */
export type IsoDate = string;

/** What the timeline list shows. Mirrors the backend's PrescriptionListItem. */
export type PrescriptionListItem = {
  id: string;
  patientId: string;
  visitDate: IsoDate;
  doctorName: string | null;
  clinicName: string | null;
  reason: string | null;
  attachmentCount: number;
  medicationCount: number;
  /**
   * First page with a preview, or null when the visit has no pages or only
   * PDFs. Chosen by the data layer so the timeline needs no request per row.
   */
  thumbnailAttachmentId: string | null;
};

/** The full record behind one visit — what the detail screen shows. */
export type Prescription = {
  id: string;
  patientId: string;
  visitDate: IsoDate;
  doctorName: string | null;
  clinicName: string | null;
  specialty: string | null;
  reason: string | null;
  notes: string | null;
  attachments: Attachment[];
};

/** One scanned page. The storage key is deliberately absent. */
export type Attachment = {
  id: string;
  pageNumber: number;
  contentType: string;
  sizeBytes: number;
  /** False for PDFs — requesting a thumbnail for those fails. */
  hasThumbnail: boolean;
};

/** Filters the user can apply. Every field optional; absent means "no filter". */
export type PrescriptionFilters = {
  patientId?: string;
  doctor?: string;
  clinic?: string;
  dateFrom?: IsoDate;
  dateTo?: IsoDate;
  q?: string;
};

/** A page of results, generic so other lists can reuse it. */
export type Page<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

export type Medication = {
  id: string;
  name: string;
  strength: string | null;
  form: string | null;
  /** Raw doctor notation, e.g. "1-0-1". Format it, never interpret it. */
  frequencyCode: string | null;
  foodRelation: string | null;
  durationDays: number | null;
  startDate: IsoDate | null;
  isActive: boolean;
};

/** The values the API accepts for food_relation. */
export type FoodRelation = 'before_food' | 'after_food' | 'with_food' | 'any';

/**
 * What the capture form produces. Distinct from Prescription: no id, no
 * attachments, and the optional fields are genuinely absent rather than null.
 */
export type NewPrescription = {
  patientId: string;
  visitDate: IsoDate;
  doctorName?: string | null;
  clinicName?: string | null;
  specialty?: string | null;
  reason?: string | null;
  notes?: string | null;
};

/**
 * The editable fields of an existing visit.
 *
 * Every field is required, unlike NewPrescription. An edit form always holds a
 * complete picture of the record, and optional fields would make "clear this
 * field" indistinguishable from "leave it alone".
 *
 * patientId is absent on purpose: moving a visit to a different person is a
 * different operation from correcting its details, and mixing them would make
 * a mis-tap in the patient chips silently reassign a medical record.
 */
export type PrescriptionEdit = {
  visitDate: IsoDate;
  doctorName: string | null;
  clinicName: string | null;
  specialty: string | null;
  reason: string | null;
  notes: string | null;
};

/** One medicine as typed into a form. Only the name is required. */
export type NewMedication = {
  name: string;
  strength?: string | null;
  form?: string | null;
  frequencyCode?: string | null;
  foodRelation?: FoodRelation | null;
  durationDays?: number | null;
  startDate?: IsoDate | null;
};
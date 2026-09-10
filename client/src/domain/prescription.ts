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

/** One scanned page. storage_key is deliberately absent — decision §5.8. */
export type Attachment = {
  id: string;
  pageNumber: number;
  contentType: string;
  sizeBytes: number;
  /** False for PDFs — requesting a thumbnail for those 404s. */
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

/** Matches your PrescriptionPage envelope, generic so other lists can reuse it. */
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

/** One medicine as typed into the capture form. Only the name is required. */
export type NewMedication = {
  name: string;
  strength?: string | null;
  form?: string | null;
  frequencyCode?: string | null;
  foodRelation?: FoodRelation | null;
  durationDays?: number | null;
  startDate?: IsoDate | null;
};
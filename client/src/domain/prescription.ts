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
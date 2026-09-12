import type { PickedFile } from '@/api/upload';
import type {
  Attachment,
  Medication,
  NewMedication,
  NewPrescription,
  Page,
  Prescription,
  PrescriptionEdit,
  PrescriptionFilters,
  PrescriptionListItem,
} from '@/domain/prescription';

export type ListPrescriptionsArgs = PrescriptionFilters & {
  limit: number;
  offset: number;
  signal?: AbortSignal;
};

/** Which stored rendition of an attachment to fetch. */
export type ImageVariant = 'thumbnail' | 'full';

/**
 * The only way screens are allowed to reach prescription data.
 *
 * Implementations:
 *   SqlitePrescriptionRepository — on-device (the shipping configuration)
 *   ApiPrescriptionRepository    — HTTP, reachable only when CLOUD_ENABLED
 *
 * Screens import this type, never a concrete class.
 */
export interface PrescriptionRepository {
  list(args: ListPrescriptionsArgs): Promise<Page<PrescriptionListItem>>;

  getById(id: string, signal?: AbortSignal): Promise<Prescription>;

  listMedications(prescriptionId: string, signal?: AbortSignal): Promise<Medication[]>;

  /**
   * A URI the image loader can render. Locally this is the stored file; over
   * HTTP it is a data URI, because an <Image> source cannot carry a bearer
   * token. The signature hides the difference.
   */
  fetchAttachmentImage(
    attachmentId: string,
    variant: ImageVariant,
    signal?: AbortSignal,
  ): Promise<string>;

  // ------------------------------------------------------------------ writes

  create(input: NewPrescription, signal?: AbortSignal): Promise<Prescription>;

  update(id: string, input: PrescriptionEdit, signal?: AbortSignal): Promise<Prescription>;

  uploadAttachment(
    prescriptionId: string,
    file: PickedFile,
    signal?: AbortSignal,
  ): Promise<Attachment>;

  addMedication(
    prescriptionId: string,
    input: NewMedication,
    signal?: AbortSignal,
  ): Promise<Medication>;

  /**
   * Removes an attachment and its stored bytes.
   *
   * The local implementation must delete the files as well as the row.
   * SQLite's cascade removes rows; nothing removes what is on disk, so
   * without this the document directory grows forever with images no record
   * references.
   */
  deleteAttachment(attachmentId: string, signal?: AbortSignal): Promise<void>;

  deleteMedication(medicationId: string, signal?: AbortSignal): Promise<void>;
}
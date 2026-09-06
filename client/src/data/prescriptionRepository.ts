import type {
  Medication,
  Page,
  Prescription,
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
 *   ApiPrescriptionRepository     — HTTP (now)
 *   SqlitePrescriptionRepository  — local DB + outbox (Phase C)
 *
 * Screens import this type, never a concrete class.
 */
export interface PrescriptionRepository {
  list(args: ListPrescriptionsArgs): Promise<Page<PrescriptionListItem>>;

  getById(id: string, signal?: AbortSignal): Promise<Prescription>;

  listMedications(
    prescriptionId: string,
    signal?: AbortSignal,
  ): Promise<Medication[]>;

  /**
   * Fetches attachment bytes with the bearer token and returns a data: URI
   * ready for <Image source={{ uri }}>. Phase B may swap this for a signed
   * short-lived URL; the signature does not change.
   */
  fetchAttachmentImage(
    attachmentId: string,
    variant: ImageVariant,
    signal?: AbortSignal,
  ): Promise<string>;
}
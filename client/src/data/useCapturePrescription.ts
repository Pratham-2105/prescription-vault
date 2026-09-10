import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PickedFile } from '@/api/upload';
import type { NewMedication, NewPrescription } from '@/domain/prescription';
import { queryKeys } from './queryKeys';
import { useRepositories } from './repositories';

export type CapturePayload = {
  /**
   * Set when retrying a partially-saved visit. The prescription already
   * exists, so creation is skipped and only the supplied pages and medicines
   * are added. Without this, a retry would create a duplicate visit.
   */
  prescriptionId?: string;
  prescription: NewPrescription;
  files: PickedFile[];
  medications: NewMedication[];
};

export type CaptureResult = {
  prescriptionId: string;
  /** Positions in `files` that did not upload. */
  failedFileIndexes: number[];
  /** Positions in `medications` that were not saved. */
  failedMedicationIndexes: number[];
};

/**
 * Saves one captured visit.
 *
 * Deliberately three sequential calls with partial-failure tolerance rather
 * than one atomic operation:
 *
 *   1. Create the prescription (skipped on retry). If this fails, nothing was
 *      saved — throw.
 *   2. Upload each page. A failure here does NOT discard the visit; the
 *      record is the thing worth keeping.
 *   3. Add each medicine. Same reasoning.
 *
 * Failures are reported by index so the caller can retry exactly the items
 * that did not land, against the visit that already exists.
 *
 * That shape is also what Phase C's outbox needs: every step independently
 * retryable.
 */
export function useCapturePrescription() {
  const { prescriptions } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation<CaptureResult, Error, CapturePayload>({
    mutationFn: async (payload) => {
      const prescriptionId =
        payload.prescriptionId ??
        (await prescriptions.create(payload.prescription)).id;

      const failedFileIndexes: number[] = [];
      // Sequential, not Promise.all: page_number is assigned server-side in
      // arrival order, so concurrent uploads would scramble the page order.
      for (const [index, file] of payload.files.entries()) {
        try {
          await prescriptions.uploadAttachment(prescriptionId, file);
        } catch {
          failedFileIndexes.push(index);
        }
      }

      const failedMedicationIndexes: number[] = [];
      for (const [index, medication] of payload.medications.entries()) {
        try {
          await prescriptions.addMedication(prescriptionId, medication);
        } catch {
          failedMedicationIndexes.push(index);
        }
      }

      return { prescriptionId, failedFileIndexes, failedMedicationIndexes };
    },

    onSuccess: (result) =>
      // Prefix match: drops every list filter variant and every detail entry.
      // Refetching beats writing into the cache by hand, because
      // groupByVisitDate depends on the server's exact row ordering.
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.prescriptions.all }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.prescriptions.detail(result.prescriptionId),
        }),
      ]),
  });
}
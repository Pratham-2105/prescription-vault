import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PickedFile } from '@/api/upload';
import type { NewMedication, NewPrescription } from '@/domain/prescription';
import { queryKeys } from './queryKeys';
import { useRepositories } from './repositories';

export type CapturePayload = {
  prescription: NewPrescription;
  files: PickedFile[];
  medications: NewMedication[];
};

export type CaptureResult = {
  prescriptionId: string;
  /** Pages the server rejected or the device could not read. */
  failedAttachments: number;
  /** Medicines that failed to save. */
  failedMedications: number;
};

/**
 * Saves one captured visit.
 *
 * Deliberately three sequential calls with partial-failure tolerance rather
 * than one atomic operation:
 *
 *   1. Create the prescription. If this fails, nothing was saved — throw.
 *   2. Upload each page. A failure here does NOT discard the visit; the
 *      record is the thing worth keeping, and the page can be retried from
 *      the detail screen.
 *   3. Add each medicine. Same reasoning.
 *
 * That shape is also what Phase C's outbox needs: every step independently
 * retryable.
 */
export function useCapturePrescription() {
  const { prescriptions } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation<CaptureResult, Error, CapturePayload>({
    mutationFn: async ({ prescription, files, medications }) => {
      const created = await prescriptions.create(prescription);

      let failedAttachments = 0;
      // Sequential, not Promise.all: page_number is assigned server-side in
      // arrival order, so concurrent uploads would scramble the page order.
      for (const file of files) {
        try {
          await prescriptions.uploadAttachment(created.id, file);
        } catch {
          failedAttachments += 1;
        }
      }

      let failedMedications = 0;
      for (const medication of medications) {
        try {
          await prescriptions.addMedication(created.id, medication);
        } catch {
          failedMedications += 1;
        }
      }

      return {
        prescriptionId: created.id,
        failedAttachments,
        failedMedications,
      };
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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Prescription, PrescriptionEdit } from '@/domain/prescription';
import { queryKeys } from './queryKeys';
import { useRepositories } from './repositories';

type UpdateInput = { id: string; edit: PrescriptionEdit };

/**
 * Saves corrections to a visit.
 *
 * Invalidates rather than patching the cache, for the same reason every other
 * write does: an edited visit_date changes where the record belongs in the
 * timeline, and reproducing that ordering client-side means reimplementing a
 * sort the data layer already owns.
 */
export function useUpdatePrescription() {
  const { prescriptions } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation<Prescription, Error, UpdateInput>({
    mutationFn: ({ id, edit }) => prescriptions.update(id, edit),
    onSuccess: (updated) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.prescriptions.all }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.prescriptions.detail(updated.id),
        }),
      ]),
  });
}

type DeleteAttachmentInput = { attachmentId: string; prescriptionId: string };

/**
 * Removes a page, and locally its stored files too.
 *
 * `prescriptionId` is passed alongside the attachment id purely so the right
 * detail query can be invalidated — the repository does not need it, but the
 * cache does, and deriving it would mean another read.
 */
export function useDeleteAttachment() {
  const { prescriptions } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation<void, Error, DeleteAttachmentInput>({
    mutationFn: ({ attachmentId }) => prescriptions.deleteAttachment(attachmentId),
    onSuccess: (_result, { prescriptionId }) =>
      Promise.all([
        // The timeline carries attachment counts and a thumbnail id, both of
        // which this may have changed.
        queryClient.invalidateQueries({ queryKey: queryKeys.prescriptions.all }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.prescriptions.detail(prescriptionId),
        }),
      ]),
  });
}

type DeleteMedicationInput = { medicationId: string; prescriptionId: string };

export function useDeleteMedication() {
  const { prescriptions } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation<void, Error, DeleteMedicationInput>({
    mutationFn: ({ medicationId }) => prescriptions.deleteMedication(medicationId),
    onSuccess: (_result, { prescriptionId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.prescriptions.all }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.prescriptions.medications(prescriptionId),
        }),
      ]),
  });
}
import { useQuery } from '@tanstack/react-query';
import type { ImageVariant } from './prescriptionRepository';
import { queryKeys } from './queryKeys';
import { useRepositories } from './repositories';

export function usePrescription(id: string) {
    const { prescriptions } = useRepositories();
    return useQuery({
        queryKey: queryKeys.prescriptions.detail(id),
        queryFn: ({ signal }) => prescriptions.getById(id, signal),
        enabled: !!id,
    });
}

export function useMedications(prescriptionId: string) {
    const { prescriptions } = useRepositories();
    return useQuery({
        queryKey: queryKeys.prescriptions.medications(prescriptionId),
        queryFn: ({ signal }) => prescriptions.listMedications(prescriptionId, signal),
        enabled: !!prescriptionId,
    });
}

/** Image bytes keyed by attachment id — immutable, so cache them hard. */
export function useAttachmentImage(attachmentId: string, variant: ImageVariant) {
    const { prescriptions } = useRepositories();
    return useQuery({
        queryKey: queryKeys.attachments.image(attachmentId, variant),
        queryFn: ({ signal }) =>
            prescriptions.fetchAttachmentImage(attachmentId, variant, signal),
        enabled: !!attachmentId,
        staleTime: Infinity,   // bytes for a given id never change
        gcTime: 10 * 60_000,   // but don't hold megabytes forever
    });
}
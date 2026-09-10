import type { PrescriptionFilters } from '@/domain/prescription';

export const queryKeys = {
  prescriptions: {
    /** Prefix — invalidate this to drop every prescription query. */
    all: ['prescriptions'] as const,
    list: (filters: PrescriptionFilters) =>
      ['prescriptions', 'list', filters] as const,
    detail: (id: string) =>
      ['prescriptions', 'detail', id] as const,
    medications: (prescriptionId: string) =>
      ['prescriptions', 'detail', prescriptionId, 'medications'] as const,
  },
  patients: {
    /** Prefix — invalidate this after adding or editing a patient. */
    all: ['patients'] as const,
    list: () => ['patients', 'list'] as const,
  },
  attachments: {
    all: ['attachments'] as const,
    image: (id: string, variant: string) =>
      ['attachments', id, 'image', variant] as const,
  },
} as const;
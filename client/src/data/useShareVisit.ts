import { useCallback, useState } from 'react';
import type { Medication, Prescription } from '@/domain/prescription';
import { shareVisit } from '@/services/shareVisit';
import { useRepositories } from './repositories';

/**
 * Exports a visit as a PDF and opens the share sheet.
 *
 * Not a TanStack mutation: nothing is written and no cache entry changes, so
 * the only state worth tracking is "in progress" and "failed". A mutation
 * would add a cache-invalidation shape this does not need.
 */
export function useShareVisit() {
  const { prescriptions } = useRepositories();
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const share = useCallback(
    (prescription: Prescription, patientName: string, medications: Medication[]) => {
      setError(null);
      setIsSharing(true);

      void (async () => {
        try {
          await shareVisit({
            prescription,
            patientName,
            medications,
            readImage: (attachmentId) =>
              prescriptions.fetchAttachmentImage(attachmentId, 'full'),
          });
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : 'Could not share this visit.');
        } finally {
          setIsSharing(false);
        }
      })();
    },
    [prescriptions],
  );

  return { share, isSharing, error };
}
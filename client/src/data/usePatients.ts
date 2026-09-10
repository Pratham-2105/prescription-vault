import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NewPatient, Patient } from '@/domain/patient';
import { queryKeys } from './queryKeys';
import { useRepositories } from './repositories';

/**
 * The family profile list.
 *
 * Patients change rarely — a handful of rows added once and then left alone —
 * so this is cached longer than the default 30s and is not worth refetching
 * on every screen focus.
 */
export function usePatients() {
  const { patients } = useRepositories();

  return useQuery({
    queryKey: queryKeys.patients.list(),
    queryFn: ({ signal }) => patients.list(signal),
    staleTime: 5 * 60_000,
  });
}

/**
 * Adds a patient.
 *
 * A mutation is not a query: it has no cache entry of its own and does not run
 * until you call it. The hook exists to give the screen `isPending` and
 * `error` without hand-rolling useState for each, and to give a place to hang
 * the cache invalidation that has to follow every write.
 */
export function useCreatePatient() {
  const { patients } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation<Patient, Error, NewPatient>({
    mutationFn: (input) => patients.create(input),

    // Returning the promise makes the mutation stay pending until the refetch
    // settles. That is deliberate: a caller that awaits mutateAsync and then
    // selects the new patient needs the list query to already contain it,
    // otherwise it selects an id the chip row cannot render yet.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.patients.all }),
  });
}
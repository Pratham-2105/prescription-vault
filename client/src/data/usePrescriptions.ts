import { useInfiniteQuery } from '@tanstack/react-query';
import type { PrescriptionFilters } from '@/domain/prescription';
import { groupByVisitDate } from '@/features/prescriptions/groupByVisitDate';
import { queryKeys } from './queryKeys';
import { useRepositories } from './repositories';

const PAGE_SIZE = 20;

/**
 * The timeline's data source.
 * Screens call this. They never touch ApiClient or the repository directly.
 */
export function usePrescriptions(filters: PrescriptionFilters = {}) {
  const { prescriptions } = useRepositories();

  return useInfiniteQuery({
    queryKey: queryKeys.prescriptions.list(filters),
    initialPageParam: 0,

    queryFn: ({ pageParam, signal }) =>
      prescriptions.list({
        ...filters,
        limit: PAGE_SIZE,
        offset: pageParam,
        signal,
      }),

    // Next offset, or undefined when everything is loaded.
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.offset + lastPage.items.length;
      return loaded < lastPage.total ? loaded : undefined;
    },

    // Flatten pages, then group. Runs on read; the cache keeps raw pages.
    select: (data) => ({
      sections: groupByVisitDate(data.pages.flatMap((page) => page.items)),
      total: data.pages[0]?.total ?? 0,
    }),
  });
}
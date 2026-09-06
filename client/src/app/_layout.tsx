import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Stack } from 'expo-router';
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
import { ApiError } from '@/api';
import { RepositoryProvider } from '@/data/repositories';
import { SessionProvider, useSession } from '@/state/session';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          // 4xx won't fix itself. ApiClient already handled the 401 refresh.
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
            return false;
          }
          return failureCount < 2;
        },
      },
    },
  });
}

/** Drops cached records when the signed-in user changes. */
function CacheBoundary({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const previousUserId = useRef<string | null>(null);

  useEffect(() => {
    const currentId = user?.id ?? null;
    if (previousUserId.current !== null && previousUserId.current !== currentId) {
      queryClient.clear();
    }
    previousUserId.current = currentId;
  }, [user, queryClient]);

  return <>{children}</>;
}

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <RepositoryProvider>
        <SessionProvider>
          <CacheBoundary>
            <Stack screenOptions={{ headerShown: false }} />
          </CacheBoundary>
        </SessionProvider>
      </RepositoryProvider>
    </QueryClientProvider>
  );
}
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authApi, onSessionExpired, tokenStore, type User } from '@/api';

type SessionState = {
  user: User | null;
  /** True until the stored token has been checked on startup. */
  isRestoring: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  // Restore a previous session on cold start.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await tokenStore.load();
        if (!stored) return;
        const me = await authApi.me();
        if (!cancelled) setUser(me);
      } catch {
        // Expired or unreachable — fall through to the login screen.
        await tokenStore.clear();
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Let the API client evict us when a refresh token is rejected mid-session.
  useEffect(() => {
    onSessionExpired(() => setUser(null));
    return () => onSessionExpired(null);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setUser(await authApi.login(email, password));
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    await authApi.register(email, password);
    setUser(await authApi.login(email, password));
  }, []);

  const signOut = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isRestoring, signIn, signUp, signOut }),
    [user, isRestoring, signIn, signUp, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
import { describe, it, expect, vi } from 'vitest';
import { ApiClient, ApiError } from './client';
import type { TokenStore, Tokens } from './tokenStore.types';

function memoryStore(initial: Tokens | null = null): TokenStore {
  let state = initial;
  return {
    async load() {
      return state;
    },
    async save(t) {
      state = t;
    },
    async clear() {
      state = null;
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ApiClient auth handling', () => {
    it('attaches the bearer token', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ ok: true }),
    );
    const api = new ApiClient({
      baseUrl: 'http://test',
      tokens: memoryStore({ accessToken: 'A1', refreshToken: 'R1' }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await api.get('/api/v1/auth/me');

    const [, init] = fetchImpl.mock.calls[0]!;
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer A1');
  });

  it('refreshes once for concurrent 401s and retries them all', async () => {
    let refreshCalls = 0;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        return jsonResponse({ access_token: 'A2', refresh_token: 'R2' });
      }
      const auth = (init?.headers as Record<string, string>)?.Authorization;
      if (auth !== 'Bearer A2') return jsonResponse({ detail: 'Not authenticated' }, 401);
      return jsonResponse({ items: [], total: 0 });
    });

    const api = new ApiClient({
      baseUrl: 'http://test',
      tokens: memoryStore({ accessToken: 'A1', refreshToken: 'R1' }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const results = await Promise.all([
      api.get('/api/v1/prescriptions'),
      api.get('/api/v1/patients'),
      api.get('/api/v1/auth/me'),
    ]);

    expect(refreshCalls).toBe(1);
    expect(results).toHaveLength(3);
  });

  it('does not refresh again when the token was already rotated', async () => {
    const tokens = memoryStore({ accessToken: 'A1', refreshToken: 'R1' });
    let refreshCalls = 0;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        return jsonResponse({ access_token: 'A2', refresh_token: 'R2' });
      }
      const auth = (init?.headers as Record<string, string>)?.Authorization;
      if (auth !== 'Bearer A2') return jsonResponse({ detail: 'Not authenticated' }, 401);
      return jsonResponse({ ok: true });
    });

    const api = new ApiClient({
      baseUrl: 'http://test',
      tokens,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await api.get('/api/v1/patients');       // triggers the refresh
    await api.get('/api/v1/prescriptions');  // late 401 would have re-refreshed

    expect(refreshCalls).toBe(1);
  });

  it('clears the session when the refresh token is rejected', async () => {
    const tokens = memoryStore({ accessToken: 'A1', refreshToken: 'DEAD' });
    const onSessionExpired = vi.fn();
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/auth/refresh')
        ? jsonResponse({ detail: 'Invalid refresh token' }, 401)
        : jsonResponse({ detail: 'Not authenticated' }, 401),
    );

    const api = new ApiClient({
      baseUrl: 'http://test',
      tokens,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onSessionExpired,
    });

    await expect(api.get('/api/v1/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(onSessionExpired).toHaveBeenCalledOnce();
    expect(await tokens.load()).toBeNull();
  });

  it('surfaces FastAPI validation errors as readable messages', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ detail: [{ loc: ['body', 'email'], msg: 'value is not a valid email address' }] }, 422),
    );
    const api = new ApiClient({
      baseUrl: 'http://test',
      tokens: memoryStore(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(api.post('/api/v1/auth/register', { body: {}, auth: false })).rejects.toThrow(
      /valid email address/,
    );
  });
});
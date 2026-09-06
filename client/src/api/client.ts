import type { TokenStore, Tokens } from './tokenStore.types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** JSON body. */
  body?: unknown;
  /** application/x-www-form-urlencoded body (used by OAuth2 login). */
  form?: URLSearchParams;
  /** multipart/form-data body (used by attachment upload). */
  multipart?: FormData;
  /** Query string parameters; undefined/null values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Set false for endpoints that must NOT send a bearer token. */
  auth?: boolean;
};

export type ApiClientOptions = {
  baseUrl: string;
  tokens: TokenStore;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  /** Called when the refresh token is dead and the user must log in again. */
  onSessionExpired?: () => void;
};

export class ApiClient {
  private readonly baseUrl: string;
  private readonly tokens: TokenStore;
  private readonly fetchImpl: typeof fetch;
  private readonly onSessionExpired?: () => void;

  /** Holds the in-flight refresh, so concurrent 401s share one call. */
  private refreshInFlight: Promise<string | null> | null = null;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.tokens = opts.tokens;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.onSessionExpired = opts.onSessionExpired;
  }

  get<T>(path: string, opts: RequestOptions = {}) {
    return this.request<T>(path, { ...opts, method: 'GET' });
  }
  post<T>(path: string, opts: RequestOptions = {}) {
    return this.request<T>(path, { ...opts, method: 'POST' });
  }
  patch<T>(path: string, opts: RequestOptions = {}) {
    return this.request<T>(path, { ...opts, method: 'PATCH' });
  }
  delete<T>(path: string, opts: RequestOptions = {}) {
    return this.request<T>(path, { ...opts, method: 'DELETE' });
  }

  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const needsAuth = opts.auth !== false;

    let { response, sentWith } = await this.send(path, opts, needsAuth);

    if (response.status === 401 && needsAuth) {
      const fresh = await this.ensureFreshToken(sentWith);
      if (!fresh) {
        await this.tokens.clear();
        this.onSessionExpired?.();
        throw new ApiError(401, 'Your session has expired. Please log in again.');
      }
      ({ response } = await this.send(path, opts, needsAuth));
    }

    return this.parse<T>(response);
  }

  // ---------------------------------------------------------------- internals

  private async send(
    path: string,
    opts: RequestOptions,
    needsAuth: boolean,
  ): Promise<{ response: Response; sentWith: string }> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    let body: BodyInit | undefined;

    if (opts.multipart) {
      // Deliberately no Content-Type: the runtime must set the multipart boundary.
      body = opts.multipart;
    } else if (opts.form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = opts.form.toString();
    } else if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }

    let sentWith = '';
    if (needsAuth) {
      const stored = await this.tokens.load();
      if (stored?.accessToken) {
        sentWith = stored.accessToken;
        headers.Authorization = `Bearer ${sentWith}`;
      }
    }

    const response = await this.fetchImpl(this.buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body,
      signal: opts.signal,
    });

    return { response, sentWith };
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const url = `${this.baseUrl}${path}`;
    if (!query) return url;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value));
      }
    }
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
  }

  /**
   * Returns a usable access token, or null if the session is unrecoverable.
   * `staleToken` is the token the failed request actually sent.
   */
  private async ensureFreshToken(staleToken: string): Promise<string | null> {
    const stored = await this.tokens.load();

    // Someone else already refreshed while our request was in flight.
    // Do NOT refresh again — the old refresh token has been rotated away.
    if (stored?.accessToken && stored.accessToken !== staleToken) {
      return stored.accessToken;
    }

    if (!this.refreshInFlight) {
      this.refreshInFlight = this.performRefresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async performRefresh(): Promise<string | null> {
    const stored = await this.tokens.load();
    if (!stored?.refreshToken) return null;

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refresh_token: stored.refreshToken }),
      });
    } catch {
      // Network failure is not an expired session — don't log the user out.
      throw new ApiError(0, 'Network error while refreshing session.');
    }

    if (!response.ok) return null;

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
    };

    const next: Tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? stored.refreshToken,
    };
    await this.tokens.save(next);
    return next.accessToken;
  }

  private async parse<T>(response: Response): Promise<T> {
    if (response.status === 204) return undefined as T;

    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      throw new ApiError(response.status, extractDetail(data, response.status), data);
    }
    return data as T;
  }
}

/** FastAPI returns {detail: string} or {detail: [{loc, msg, type}, …]}. */
function extractDetail(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) =>
          item && typeof item === 'object' && 'msg' in item
            ? String((item as { msg: unknown }).msg)
            : null,
        )
        .filter(Boolean);
      if (messages.length) return messages.join('; ');
    }
  }
  return `Request failed with status ${status}`;
}
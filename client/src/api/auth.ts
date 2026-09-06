import type { ApiClient } from "./client";
import type { TokenStore } from "./tokenStore.types";

export type TokenPair = {
    access_token: string;
    refresh_token: string;
    token_type?: string;
}

export type User = {
    id: string;
    email: string;
    created_at: string;
}

export function createAuthApi(api: ApiClient, tokens: TokenStore) {
    return {
        async register(email: string, password: string): Promise<User> {
            return api.post<User>('/api/v1/auth/register', {
                body: { email, password },
                auth: false,
            });
        },

        async login(email: string, password: string): Promise<User> {
            // OAuth2PasswordRequestForm expects form-encoded `username`/`password`.
            const form = new URLSearchParams({ username: email, password });
            const pair = await api.post<TokenPair>('/api/v1/auth/login', {
                form,
                auth: false,
            });
            await tokens.save({
                accessToken: pair.access_token,
                refreshToken: pair.refresh_token,
            });
            return api.get<User>('/api/v1/auth/me');
        },

        async me(): Promise<User> {
            return api.get<User>('/api/v1/auth/me');
        },

        async logout(): Promise<void> {
            const stored = await tokens.load();
            try {
                if (stored?.refreshToken) {
                    // auth: false — an auth'd call could 401, trigger a refresh, and rotate
                    // the token away, leaving the retry revoking a token that no longer exists.
                    await api.post('/api/v1/auth/logout', {
                        body: { refresh_token: stored.refreshToken },
                        auth: false,
                    });
                }
            } finally {
                await tokens.clear();
            }
        },
    };
}
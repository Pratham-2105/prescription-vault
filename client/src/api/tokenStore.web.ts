import type { TokenStore, Tokens } from "./tokenStore.types";

const REFRESH_KEY = 'pv.refresh_token';

/**
 * Web: the access token is held in memory ONLY. It dies on page reload,
 * and we silently mint a new one from the refresh token.
 */

let accessToken = '';

export const tokenStore: TokenStore = {
    async load() {
        const refreshToken = globalThis.localStorage?.getItem(REFRESH_KEY);
        if (!refreshToken) return null;
        return { accessToken, refreshToken };
    },

    async save(tokens: Tokens) {
        accessToken = tokens.accessToken;
        globalThis.localStorage?.setItem(REFRESH_KEY, tokens.refreshToken);
    },

    async clear() {
        accessToken = '';
        globalThis.localStorage?.removeItem(REFRESH_KEY);
    }
};
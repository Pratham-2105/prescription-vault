import { API_BASE_URL } from '@/config';
import { ApiClient } from './client';
import { createAuthApi } from './auth';
import { tokenStore } from './tokenStore';

/** Set by the session provider so a dead refresh token can drop React state. */
let sessionExpiredHandler: (() => void) | null = null;

export function onSessionExpired(handler: (() => void) | null) {
    sessionExpiredHandler = handler;
}

export const api = new ApiClient({
    baseUrl: API_BASE_URL,
    tokens: tokenStore,
    onSessionExpired: () => sessionExpiredHandler?.(),
});

export const authApi = createAuthApi(api, tokenStore);
export { tokenStore };
export { ApiError } from './client';
export type { User } from './auth';
import type { TokenStore } from './tokenStore.types';

/**
 * Type-only declaration for the platform-split module.
 * Metro resolves tokenStore.web.ts or tokenStore.native.ts at bundle time;
 * this file exists purely so `tsc` knows the module's shape.
 */
export declare const tokenStore: TokenStore;
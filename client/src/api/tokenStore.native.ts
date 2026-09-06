import * as SecureStore from 'expo-secure-store';
import type { TokenStore, Tokens } from './tokenStore.types';

const ACCESS_KEY = 'pv_access_token';
const REFRESH_KEY = 'pv_refresh_token';

export const tokenStore: TokenStore = {
  async load() {
    const [accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_KEY),
      SecureStore.getItemAsync(REFRESH_KEY),
    ]);
    if (!refreshToken) return null;
    return { accessToken: accessToken ?? '', refreshToken };
  },

  async save(tokens: Tokens) {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken),
      SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken),
    ]);
  },

  async clear() {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
    ]);
  },
};
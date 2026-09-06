import { Platform } from "react-native";

function resolveBaseUrl(): string {
    const fromEnv = process.env.EXPO_PUBLIC_API_URL;
    if (fromEnv) return fromEnv.replace(/\/+$/, '');

    // Android emulator maps the host machine to this special address.
    if (Platform.OS === 'android') return 'http://10.0.2.2:8000';

    // Web and the iOS simulator both reach the host directly.
    // Physical devices must set EXPO_PUBLIC_API_URL to the host's LAN address.
    return 'http://127.0.0.1:8000';
}

export const API_BASE_URL = resolveBaseUrl();
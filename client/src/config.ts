import { Platform } from "react-native";

const LAN_IP = '172.29.112.1';

function resolveBaseUrl(): string {
    const fromEnv = process.env.EXPO_PUBLIC_API_URL;
    if (fromEnv) return fromEnv.replace(/\/+$/, '');
    
    // Browser on the same machine as the server.
    if (Platform.OS === 'web') return 'http://127.0.0.1:8000'

    // Android emulator maps the host machine to this special address.
    if (Platform.OS === 'android') return 'http://10.0.2.2:8000';

    // iOS simulator can use localhost; a physical decied needs the LAN IP.
    return 'http://${LAN_IP}:8000';
}

export const API_BASE_URL = resolveBaseUrl();
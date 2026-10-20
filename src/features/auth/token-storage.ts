import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const keys = { access: 'pharmashop.accessToken', refresh: 'pharmashop.refreshToken', user: 'pharmashop.user' } as const;
let webSession: Partial<Record<keyof typeof keys, string>> = {};
const expirationListeners = new Set<() => void>();

export function onSessionExpired(listener: () => void) {
  expirationListeners.add(listener);
  return () => { expirationListeners.delete(listener); };
}

export function notifySessionExpired() {
  expirationListeners.forEach((listener) => listener());
}

export async function readCredential(key: keyof typeof keys) {
  return Platform.OS === 'web' ? webSession[key] ?? null : SecureStore.getItemAsync(keys[key]);
}

export async function saveCredentials(values: { accessToken: string; refreshToken: string; user: string }) {
  if (Platform.OS === 'web') {
    webSession = { access: values.accessToken, refresh: values.refreshToken, user: values.user };
    return;
  }
  await Promise.all([
    SecureStore.setItemAsync(keys.access, values.accessToken),
    SecureStore.setItemAsync(keys.refresh, values.refreshToken),
    SecureStore.setItemAsync(keys.user, values.user),
  ]);
}

export async function clearCredentials() {
  if (Platform.OS === 'web') { webSession = {}; return; }
  await Promise.all(Object.values(keys).map((key) => SecureStore.deleteItemAsync(key)));
}

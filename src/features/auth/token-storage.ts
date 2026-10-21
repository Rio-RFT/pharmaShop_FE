import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const keys = { access: 'pharmashop.accessToken', refresh: 'pharmashop.refreshToken', user: 'pharmashop.user', push: 'pharmashop.pushToken' } as const;
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

export async function readPushToken() {
  return Platform.OS === 'web' ? webSession.push ?? null : SecureStore.getItemAsync(keys.push);
}

export async function savePushToken(token: string) {
  if (Platform.OS === 'web') { webSession.push = token; return; }
  await SecureStore.setItemAsync(keys.push, token);
}

export async function clearPushToken() {
  if (Platform.OS === 'web') { delete webSession.push; return; }
  await SecureStore.deleteItemAsync(keys.push);
}

export async function clearCredentials() {
  if (Platform.OS === 'web') { delete webSession.access; delete webSession.refresh; delete webSession.user; return; }
  await Promise.all([keys.access, keys.refresh, keys.user].map((key) => SecureStore.deleteItemAsync(key)));
}

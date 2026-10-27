import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const keys = { access: 'pharmashop.accessToken', refresh: 'pharmashop.refreshToken', user: 'pharmashop.user', push: 'pharmashop.pushToken', pushOwner: 'pharmashop.pushOwner' } as const;
let webSession: Partial<Record<keyof typeof keys, string>> = {};
const expirationListeners = new Set<() => void>();
const credentialListeners = new Set<() => void>();

export function onCredentialsChanged(listener: () => void) {
  credentialListeners.add(listener);
  return () => { credentialListeners.delete(listener); };
}

function notifyCredentialsChanged() {
  credentialListeners.forEach((listener) => listener());
}

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
    notifyCredentialsChanged();
    return;
  }
  await Promise.all([
    SecureStore.setItemAsync(keys.access, values.accessToken),
    SecureStore.setItemAsync(keys.refresh, values.refreshToken),
    SecureStore.setItemAsync(keys.user, values.user),
  ]);
  notifyCredentialsChanged();
}

export async function readPushToken() {
  return Platform.OS === 'web' ? webSession.push ?? null : SecureStore.getItemAsync(keys.push);
}

export async function readPushTokenOwner() {
  return Platform.OS === 'web' ? webSession.pushOwner ?? null : SecureStore.getItemAsync(keys.pushOwner);
}

export async function savePushToken(token: string, userId: string) {
  if (Platform.OS === 'web') { webSession.push = token; webSession.pushOwner = userId; return; }
  await Promise.all([SecureStore.setItemAsync(keys.push, token), SecureStore.setItemAsync(keys.pushOwner, userId)]);
}

export async function clearPushToken() {
  if (Platform.OS === 'web') { delete webSession.push; delete webSession.pushOwner; return; }
  await Promise.all([SecureStore.deleteItemAsync(keys.push), SecureStore.deleteItemAsync(keys.pushOwner)]);
}

export async function clearCredentials() {
  if (Platform.OS === 'web') { delete webSession.access; delete webSession.refresh; delete webSession.user; notifyCredentialsChanged(); return; }
  await Promise.all([keys.access, keys.refresh, keys.user].map((key) => SecureStore.deleteItemAsync(key)));
  notifyCredentialsChanged();
}

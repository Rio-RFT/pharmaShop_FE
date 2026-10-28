import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const keys = { access: 'pharmashop.accessToken', refresh: 'pharmashop.refreshToken', user: 'pharmashop.user', push: 'pharmashop.pushToken', pushOwner: 'pharmashop.pushOwner' } as const;
let webSession: Partial<Record<keyof typeof keys, string>> = {};

function getWebStorage(): Storage | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

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
  if (Platform.OS !== 'web') return SecureStore.getItemAsync(keys[key]);
  try {
    return getWebStorage()?.getItem(keys[key]) ?? webSession[key] ?? null;
  } catch {
    return webSession[key] ?? null;
  }
}

export async function saveCredentials(values: { accessToken: string; refreshToken: string; user: string }) {
  if (Platform.OS === 'web') {
    webSession = { access: values.accessToken, refresh: values.refreshToken, user: values.user };
    const storage = getWebStorage();
    try {
      storage?.setItem(keys.access, values.accessToken);
      storage?.setItem(keys.refresh, values.refreshToken);
      storage?.setItem(keys.user, values.user);
    } catch {
      // Keep the current session usable when browser storage is unavailable.
    }
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
  if (Platform.OS !== 'web') return SecureStore.getItemAsync(keys.push);
  return getWebStorage()?.getItem(keys.push) ?? webSession.push ?? null;
}

export async function readPushTokenOwner() {
  if (Platform.OS !== 'web') return SecureStore.getItemAsync(keys.pushOwner);
  return getWebStorage()?.getItem(keys.pushOwner) ?? webSession.pushOwner ?? null;
}

export async function savePushToken(token: string, userId: string) {
  if (Platform.OS === 'web') {
    webSession.push = token;
    webSession.pushOwner = userId;
    const storage = getWebStorage();
    storage?.setItem(keys.push, token);
    storage?.setItem(keys.pushOwner, userId);
    return;
  }
  await Promise.all([SecureStore.setItemAsync(keys.push, token), SecureStore.setItemAsync(keys.pushOwner, userId)]);
}

export async function clearPushToken() {
  if (Platform.OS === 'web') {
    delete webSession.push;
    delete webSession.pushOwner;
    const storage = getWebStorage();
    storage?.removeItem(keys.push);
    storage?.removeItem(keys.pushOwner);
    return;
  }
  await Promise.all([SecureStore.deleteItemAsync(keys.push), SecureStore.deleteItemAsync(keys.pushOwner)]);
}

export async function clearCredentials() {
  if (Platform.OS === 'web') {
    delete webSession.access;
    delete webSession.refresh;
    delete webSession.user;
    const storage = getWebStorage();
    storage?.removeItem(keys.access);
    storage?.removeItem(keys.refresh);
    storage?.removeItem(keys.user);
    notifyCredentialsChanged();
    return;
  }
  await Promise.all([keys.access, keys.refresh, keys.user].map((key) => SecureStore.deleteItemAsync(key)));
  notifyCredentialsChanged();
}

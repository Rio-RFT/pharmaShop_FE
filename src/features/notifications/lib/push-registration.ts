import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { apiDeleteWithBody, apiPost } from '@/shared/api/client';
import { clearPushToken, readCredential, readPushToken, readPushTokenOwner, savePushToken } from '@/features/auth/token-storage';

export type PushRegistrationResult = 'registered' | 'already-registered' | 'permission-denied' | 'unsupported' | 'account-changed';
export type PushRegistrationErrorCode = 'FIREBASE_APP_UNAVAILABLE' | 'FCM_SERVICES_UNAVAILABLE' | 'NATIVE_MESSAGING_MODULE_MISSING' | 'TOKEN_FETCH_FAILED';

export class PushRegistrationError extends Error {
  constructor(readonly code: PushRegistrationErrorCode) {
    super('Unable to obtain a Firebase Cloud Messaging token.');
    this.name = 'PushRegistrationError';
  }
}

const pendingRegistrations = new Map<string, Promise<PushRegistrationResult>>();

export async function registerPushDevice(userId: string, options: { requestPermission?: boolean } = {}): Promise<PushRegistrationResult> {
  if (pendingRegistrations.has(userId)) return pendingRegistrations.get(userId)!;
  const registration = performRegistration(userId, options.requestPermission ?? true);
  pendingRegistrations.set(userId, registration);
  try {
    return await registration;
  } finally {
    if (pendingRegistrations.get(userId) === registration) pendingRegistrations.delete(userId);
  }
}

async function performRegistration(userId: string, requestPermission: boolean): Promise<PushRegistrationResult> {
  // Android emulators with Google Play Services can issue FCM tokens; iOS simulators cannot register with APNs.
  if (Platform.OS === 'web' || (Platform.OS === 'ios' && !Device.isDevice)) return 'unsupported';

  let Notifications: typeof import('expo-notifications');
  try {
    Notifications = await import('expo-notifications');
  } catch {
    return 'unsupported';
  }

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && requestPermission && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted || permission.status !== 'granted') return 'permission-denied';

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Thông báo PharmaShop',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const token = await fetchFcmToken();
  return registerFcmTokenForUser(userId, token);
}

async function fetchFcmToken() {
  try {
    const { getMessaging, getToken, isDeviceRegisteredForRemoteMessages, registerDeviceForRemoteMessages } = await import('@react-native-firebase/messaging');
    const messaging = getMessaging();
    if (Platform.OS === 'ios' && !isDeviceRegisteredForRemoteMessages(messaging)) {
      await registerDeviceForRemoteMessages(messaging);
    }
    const token = await getToken(messaging);
    if (!token || /^(Exponent|Expo)PushToken\[/.test(token)) throw new Error('invalid registration token');
    return token;
  } catch (error) {
    throw classifyPushError(error);
  }
}

function classifyPushError(error: unknown): PushRegistrationError {
  const nativeCode = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : '';
  if (nativeCode === 'app/no-app') return new PushRegistrationError('FIREBASE_APP_UNAVAILABLE');
  if (nativeCode.startsWith('messaging/')) return new PushRegistrationError('FCM_SERVICES_UNAVAILABLE');
  if (error instanceof Error && /native module|could not be found|not found in the native binary/i.test(error.message)) {
    return new PushRegistrationError('NATIVE_MESSAGING_MODULE_MISSING');
  }
  return new PushRegistrationError('TOKEN_FETCH_FAILED');
}

async function registerFcmTokenForUser(userId: string, token: string): Promise<PushRegistrationResult> {
  const serializedUser = await readCredential('user');
  let currentUserId: unknown;
  try {
    currentUserId = serializedUser ? (JSON.parse(serializedUser) as { id?: unknown }).id : undefined;
  } catch {
    currentUserId = undefined;
  }
  if (currentUserId !== userId) return 'account-changed';

  const [storedToken, storedOwner] = await Promise.all([readPushToken(), readPushTokenOwner()]);
  if (storedToken === token && storedOwner === userId) return 'already-registered';

  await apiPost<{ id: string }, { token: string }>('/users/push-token', { token });
  await savePushToken(token, userId);
  return 'registered';
}

export async function subscribeToPushTokenRefresh(userId: string, onError: (error: unknown) => void): Promise<() => void> {
  if (Platform.OS === 'web' || (Platform.OS === 'ios' && !Device.isDevice)) return () => undefined;
  try {
    const { getMessaging, onTokenRefresh } = await import('@react-native-firebase/messaging');
    const unsubscribe = onTokenRefresh(getMessaging(), (token) => {
      void registerFcmTokenForUser(userId, token).catch(onError);
    });
    return unsubscribe;
  } catch (error) {
    onError(classifyPushError(error));
    return () => undefined;
  }
}

export async function unregisterPushDevice() {
  const token = await readPushToken();
  if (!token) return;
  try {
    await apiDeleteWithBody<{ message: string }, { token: string }>('/users/push-token', { token }, { maxDurationMs: 3_000 });
    await clearPushToken();
  } catch {
    // Keep the token for a later login; logout must remain bounded if the network is unavailable.
  }
}

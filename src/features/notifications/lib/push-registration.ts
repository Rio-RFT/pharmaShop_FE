import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiDeleteWithBody, apiPost } from '@/shared/api/client';
import { clearPushToken, readPushToken, savePushToken } from '@/features/auth/token-storage';

export async function registerPushDevice() {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  const permission = await Notifications.getPermissionsAsync();
  const status = permission.granted ? permission.status : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Thông báo PharmaShop', importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('Thiếu EAS project ID để đăng ký push notification.');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await apiPost<{ id: string }, { token: string }>('/users/push-token', { token });
  await savePushToken(token);
  return token;
}

export async function unregisterPushDevice() {
  const token = await readPushToken();
  if (!token) return;
  try {
    await apiDeleteWithBody<{ message: string }, { token: string }>('/users/push-token', { token });
    await clearPushToken();
  } catch {
    // Preserve the token so logout can still complete; a later login will re-register it to the active account.
  }
}

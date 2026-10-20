import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const key = 'pharmashop.pendingPayOSOrderId';
let webValue: string | null = null;

export const savePendingPayOSOrder = (orderId: string) => Platform.OS === 'web' ? (webValue = orderId, Promise.resolve()) : SecureStore.setItemAsync(key, orderId);
export const readPendingPayOSOrder = () => Platform.OS === 'web' ? Promise.resolve(webValue) : SecureStore.getItemAsync(key);
export const clearPendingPayOSOrder = () => Platform.OS === 'web' ? (webValue = null, Promise.resolve()) : SecureStore.deleteItemAsync(key);

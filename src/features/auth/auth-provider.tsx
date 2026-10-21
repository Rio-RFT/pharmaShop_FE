import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, getAuth, getIdToken, signInWithCredential, signOut as signOutFirebase } from '@react-native-firebase/auth';
import { Platform } from 'react-native';
import { ApiError, apiPost } from '@/shared/api/client';
import { clearCredentials, onSessionExpired, readCredential, saveCredentials } from '@/features/auth/token-storage';
import { addCartItem } from '@/features/cart/api/cart';
import type { Medicine } from '@/features/catalog/api/medicines';

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
if (googleWebClientId) GoogleSignin.configure({ webClientId: googleWebClientId });

export type AuthUser = { id: string; fullName: string; phone: string; email: string | null; role: 'CUSTOMER' | 'PHARMACIST' | 'ADMIN'; avatarUrl: string | null };
export type GuestCartEntry = { medicine: Medicine; quantity: number };
type AuthResponse = { user: AuthUser; accessToken: string; refreshToken: string };
type AuthContextValue = { user: AuthUser | null; loading: boolean; guestItems: GuestCartEntry[]; guestCartSyncError: string | null; addGuestItem: (medicine: Medicine) => void; setGuestQuantity: (medicineId: string, quantity: number) => void; removeGuestItem: (medicineId: string) => void; retryGuestCartSync: () => Promise<void>; signIn: (identifier: string, password: string) => Promise<void>; signInWithGoogle: () => Promise<boolean>; signInWithGoogleCode: (code: string) => Promise<void>; signUp: (input: { fullName: string; phone: string; email?: string; password: string }) => Promise<void>; signOut: () => Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [guestItems, setGuestItems] = useState<GuestCartEntry[]>([]);
  const [guestCartSyncError, setGuestCartSyncError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;
    void Promise.all([readCredential('access'), readCredential('refresh'), readCredential('user')]).then(async ([access, refresh, serializedUser]) => {
      if (!access || !refresh || !serializedUser) return;
      try { const restored: unknown = JSON.parse(serializedUser); if (isAuthUser(restored) && active) setUser(restored); }
      catch { await clearCredentials(); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => onSessionExpired(() => { void clearCredentials(); setUser(null); queryClient.removeQueries({ queryKey: ['cart'] }); queryClient.removeQueries({ queryKey: ['orders'] }); queryClient.removeQueries({ queryKey: ['profile'] }); queryClient.removeQueries({ queryKey: ['addresses'] }); }), [queryClient]);

  const acceptSession = useCallback(async (response: AuthResponse) => {
    await saveCredentials({ accessToken: response.accessToken, refreshToken: response.refreshToken, user: JSON.stringify(response.user) });
    setUser(response.user);
  }, []);

  const syncGuestCart = useCallback(async () => {
    setGuestCartSyncError(null);
    await queryClient.cancelQueries({ queryKey: ['cart'] });
    let didSync = false;
    for (const entry of guestItems) {
      try {
        const cart = await addCartItem(entry.medicine.id, entry.quantity);
        didSync = true;
        queryClient.setQueryData(['cart'], cart);
        setGuestItems((items) => items.filter((item) => item.medicine.id !== entry.medicine.id));
      } catch {
        setGuestCartSyncError('Chưa đồng bộ được một số sản phẩm trong giỏ tạm. Hãy thử lại khi có kết nối.');
        break;
      }
    }
    if (didSync) await queryClient.invalidateQueries({ queryKey: ['cart'] });
  }, [guestItems, queryClient]);

  const addGuestItem = useCallback((medicine: Medicine) => {
    setGuestItems((items) => {
      const existing = items.find((item) => item.medicine.id === medicine.id);
      return existing
        ? items.map((item) => item.medicine.id === medicine.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...items, { medicine, quantity: 1 }];
    });
  }, []);

  const setGuestQuantity = useCallback((medicineId: string, quantity: number) => {
    setGuestItems((items) => quantity < 1
      ? items.filter((item) => item.medicine.id !== medicineId)
      : items.map((item) => item.medicine.id === medicineId ? { ...item, quantity } : item));
  }, []);

  const removeGuestItem = useCallback((medicineId: string) => {
    setGuestItems((items) => items.filter((item) => item.medicine.id !== medicineId));
  }, []);

  const signIn = useCallback(async (identifier: string, password: string) => {
    await acceptSession(await apiPost<AuthResponse, { identifier: string; password: string }>('/auth/login', { identifier, password }));
    await syncGuestCart();
  }, [acceptSession, syncGuestCart]);

  const signInWithGoogle = useCallback(async () => {
    if (Platform.OS !== 'android') {
      throw new Error('Đăng nhập Firebase bằng Google hiện chỉ được bật trên Android.');
    }
    if (!googleWebClientId) {
      throw new Error('Thiếu EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID trong môi trường build của ứng dụng.');
    }
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();
      if (result.type === 'cancelled') return false;

      const googleIdToken = result.data.idToken;
      if (!googleIdToken) {
        throw new Error('Google chưa trả về thông tin đăng nhập. Hãy kiểm tra Web OAuth client ID.');
      }

      const googleCredential = GoogleAuthProvider.credential(googleIdToken);
      const firebaseUser = (await signInWithCredential(getAuth(), googleCredential)).user;
      const firebaseIdToken = await getIdToken(firebaseUser);
      const session = await apiPost<AuthResponse, { idToken: string }>('/auth/firebase', { idToken: firebaseIdToken });

      await acceptSession(session);
      await syncGuestCart();
      return true;
    } catch (error) {
      await clearGoogleFirebaseSession();

      if (error instanceof ApiError && error.statusCode === 409) {
        throw new ApiError('Email Google này đã thuộc tài khoản PharmaShop khác. Hãy đăng nhập bằng phương thức hiện tại; ứng dụng không tự liên kết tài khoản.', 409);
      }

      const code = getErrorCode(error);
      if (code === 'SIGN_IN_CANCELLED' || code === '12501') return false;
      if (code === 'PLAY_SERVICES_NOT_AVAILABLE' || code === 'SERVICE_MISSING' || code === 'SERVICE_VERSION_UPDATE_REQUIRED') {
        throw new Error('Thiết bị cần cài đặt hoặc cập nhật Google Play services để đăng nhập.');
      }
      if (code === 'auth/operation-not-allowed') {
        throw new Error('Đăng nhập Google chưa được bật trong Firebase Authentication.');
      }
      if (code === 'auth/network-request-failed') {
        throw new Error('Không thể kết nối Firebase. Hãy kiểm tra kết nối mạng rồi thử lại.');
      }
      if (code === '10' || code === 'DEVELOPER_ERROR') {
        throw new Error('Cấu hình Google Sign-In chưa khớp package hoặc SHA-1 của bản ứng dụng này.');
      }
      throw error;
    }
  }, [acceptSession, syncGuestCart]);

  const signInWithGoogleCode = useCallback(async (code: string) => {
    await acceptSession(await apiPost<AuthResponse, { code: string }>('/auth/google/exchange', { code }));
    await syncGuestCart();
  }, [acceptSession, syncGuestCart]);

  const signUp = useCallback(async (input: { fullName: string; phone: string; email?: string; password: string }) => {
    await acceptSession(await apiPost<AuthResponse, typeof input & { role: 'CUSTOMER' }>('/auth/register', { ...input, role: 'CUSTOMER' }));
    await syncGuestCart();
  }, [acceptSession, syncGuestCart]);

  const signOut = useCallback(async () => {
    await clearCredentials();
    setUser(null);
    if (Platform.OS === 'android') {
      await clearGoogleFirebaseSession();
    }
    queryClient.removeQueries({ queryKey: ['cart'] });
    queryClient.removeQueries({ queryKey: ['orders'] });
    queryClient.removeQueries({ queryKey: ['profile'] });
    queryClient.removeQueries({ queryKey: ['addresses'] });
  }, [queryClient]);

  const value = useMemo(() => ({ user, loading, guestItems, guestCartSyncError, addGuestItem, setGuestQuantity, removeGuestItem, retryGuestCartSync: syncGuestCart, signIn, signInWithGoogle, signInWithGoogleCode, signUp, signOut }), [user, loading, guestItems, guestCartSyncError, addGuestItem, setGuestQuantity, removeGuestItem, syncGuestCart, signIn, signInWithGoogle, signInWithGoogleCode, signUp, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth phải được gọi bên trong AuthProvider.');
  return context;
}

function isAuthUser(value: unknown): value is AuthUser {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string' && typeof candidate.fullName === 'string' && typeof candidate.phone === 'string' && (candidate.role === 'CUSTOMER' || candidate.role === 'PHARMACIST' || candidate.role === 'ADMIN');
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = error.code;
  return typeof code === 'string' || typeof code === 'number' ? String(code) : undefined;
}

async function clearGoogleFirebaseSession() {
  await Promise.allSettled([
    Promise.resolve().then(() => signOutFirebase(getAuth())),
    Promise.resolve().then(() => GoogleSignin.signOut()),
  ]);
}

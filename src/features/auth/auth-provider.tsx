import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, apiPost } from '@/shared/api/client';
import { clearCredentials, onSessionExpired, readCredential, saveCredentials } from '@/features/auth/token-storage';
import { addCartItem } from '@/features/cart/api/cart';
import type { Medicine } from '@/features/catalog/api/medicines';

export type AuthUser = { id: string; fullName: string; phone: string; email: string | null; role: 'CUSTOMER' | 'PHARMACIST' | 'ADMIN'; avatarUrl: string | null };
export type GuestCartEntry = { medicine: Medicine; quantity: number };
type AuthResponse = { user: AuthUser; accessToken: string; refreshToken: string };
type AuthContextValue = { user: AuthUser | null; loading: boolean; guestItems: GuestCartEntry[]; guestCartSyncError: string | null; addGuestItem: (medicine: Medicine) => void; setGuestQuantity: (medicineId: string, quantity: number) => void; removeGuestItem: (medicineId: string) => void; retryGuestCartSync: () => Promise<void>; signIn: (identifier: string, password: string) => Promise<void>; signUp: (input: { fullName: string; phone: string; email?: string; password: string }) => Promise<void>; signOut: () => Promise<void> };
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

  const signUp = useCallback(async (input: { fullName: string; phone: string; email?: string; password: string }) => {
    await acceptSession(await apiPost<AuthResponse, typeof input & { role: 'CUSTOMER' }>('/auth/register', { ...input, role: 'CUSTOMER' }));
    await syncGuestCart();
  }, [acceptSession, syncGuestCart]);

  const signOut = useCallback(async () => {
    await clearCredentials();
    setUser(null);
    queryClient.removeQueries({ queryKey: ['cart'] });
    queryClient.removeQueries({ queryKey: ['orders'] });
    queryClient.removeQueries({ queryKey: ['profile'] });
    queryClient.removeQueries({ queryKey: ['addresses'] });
  }, [queryClient]);

  const value = useMemo(() => ({ user, loading, guestItems, guestCartSyncError, addGuestItem, setGuestQuantity, removeGuestItem, retryGuestCartSync: syncGuestCart, signIn, signUp, signOut }), [user, loading, guestItems, guestCartSyncError, addGuestItem, setGuestQuantity, removeGuestItem, syncGuestCart, signIn, signUp, signOut]);
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

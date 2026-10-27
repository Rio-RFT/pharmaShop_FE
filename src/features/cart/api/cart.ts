import { apiDelete, apiGet, apiPatch, apiPost } from '@/shared/api/client';
import type { Medicine } from '@/features/catalog/api/medicines';

export type CartItem = { id: string; medicineId: string; quantity: number; lineTotal: number | string | null; medicine: Medicine };
export type Cart = { id: string | null; items: CartItem[]; itemCount: number; subtotal: number | string | null; updatedAt: string | null };

export const getCart = () => apiGet<Cart>('/cart');
export const addCartItem = (medicineId: string, quantity: number) => apiPost<Cart, { medicineId: string; quantity: number }>('/cart/items', { medicineId, quantity });
export const setCartItemQuantity = (medicineId: string, quantity: number) => apiPatch<Cart, { quantity: number }>(`/cart/items/${encodeURIComponent(medicineId)}`, { quantity });
export const removeCartItem = (medicineId: string) => apiDelete<Cart>(`/cart/items/${encodeURIComponent(medicineId)}`);
export const clearCart = () => apiDelete<Cart>('/cart');

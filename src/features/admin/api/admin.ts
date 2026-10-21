import { apiDelete, apiGet, apiPatch, apiPost } from '@/shared/api/client';

export type ChatStatus = 'WAITING_FOR_STAFF' | 'ASSIGNED' | 'CLOSURE_PENDING' | 'ARCHIVED';
export type AdminConversation = {
  id: string; status: ChatStatus; assignedStaffId: string | null; assignedStaffName: string | null;
  lastMessageAt: string; expiresAt: string; closureRequestedAt: string | null; archivedAt: string | null;
  archivedReason: string | null; createdAt: string; updatedAt: string; customer: { id: string; fullName: string };
};
export type AdminChatMessage = {
  id: string; conversationId: string; senderId: string | null; senderRole: 'CUSTOMER' | 'PHARMACIST' | 'ADMIN' | null;
  senderName: string | null; type: 'SYSTEM' | 'TEXT' | 'IMAGE' | 'PRODUCT'; content: string;
  clientMessageId: string | null; product: Record<string, unknown> | null; attachment: Record<string, unknown> | null; createdAt: string;
};
export type Page<T> = { data: T[]; pagination: { total: number; page: number; limit: number; totalPages: number } };
export type AdminUser = { id: string; fullName: string; phone: string; email: string | null; role: 'CUSTOMER' | 'PHARMACIST' | 'ADMIN'; isActive: boolean; createdAt: string; _count?: { orders: number } };
export type AdminCoupon = { id: string; code: string; discountType: 'PERCENTAGE' | 'FIXED_AMOUNT'; discountValue: number | string; minOrderAmount: number | string; maxDiscount: number | string | null; startsAt: string; expiresAt: string; usageLimit: number | null; usedCount: number; isActive: boolean };
export type AdminMedicine = { id: string; name: string; activeIngredient: string; category: string; price: number | string; stockQuantity: number; unit?: string; packaging: string; imageUrl?: string | null };
export type AdminOrder = { id: string; status: string; paymentStatus: string; totalAmount: number | string; createdAt: string; user?: { fullName: string; phone: string }; items?: Array<{ medicine: { name: string }; quantity: number }> };

export const listChat = (status?: ChatStatus) => apiGet<{ items: AdminConversation[]; nextCursor: string | null }>('/chat/conversations', { status, limit: 50 });
export const getChatMessages = (id: string) => apiGet<{ items: AdminChatMessage[]; nextCursor: string | null }>(`/chat/conversations/${id}/messages`, { limit: 100 });
export const acceptChat = (id: string) => apiPost<AdminConversation, Record<string, never>>(`/chat/conversations/${id}/accept`, {});
export const sendChatMessage = (id: string, input: { clientMessageId: string; content: string }) => apiPost<AdminChatMessage, typeof input>(`/chat/conversations/${id}/messages`, input);
export const closeChat = (id: string) => apiPost<AdminConversation, Record<string, never>>(`/chat/conversations/${id}/closure-request`, {});
export const archiveChat = (id: string) => apiPost<AdminConversation, Record<string, never>>(`/chat/conversations/${id}/staff-archive`, {});
export const reopenChat = (id: string) => apiPost<AdminConversation, Record<string, never>>(`/chat/admin/conversations/${id}/reopen`, {});

export const listUsers = (page = 1, search?: string) => apiGet<Page<AdminUser>>('/users/admin/all', { page, limit: 20, search });
export const updateUser = (id: string, input: Partial<Pick<AdminUser, 'role' | 'isActive'>>) => apiPatch<AdminUser, typeof input>(`/users/admin/${id}`, input);
export const listCoupons = () => apiGet<AdminCoupon[]>('/coupons/admin');
export const createCoupon = (input: Record<string, unknown>) => apiPost<AdminCoupon, typeof input>('/coupons', input);
export const updateCoupon = (id: string, input: Record<string, unknown>) => apiPatch<AdminCoupon, typeof input>(`/coupons/${id}`, input);
export const disableCoupon = (id: string) => apiDelete<{ message: string }>(`/coupons/${id}`);
export const listMedicines = (page = 1, keyword?: string) => apiGet<{ data: AdminMedicine[]; pagination: Page<AdminMedicine>['pagination'] }>('/medicines/search', { page, limit: 30, keyword });
export const createMedicine = (input: Record<string, unknown>) => apiPost<AdminMedicine, typeof input>('/medicines', input);
export const updateMedicine = (id: string, input: Record<string, unknown>) => apiPatch<AdminMedicine, typeof input>(`/medicines/${id}`, input);
export const deleteMedicine = (id: string) => apiDelete<{ message: string }>(`/medicines/${id}`);
export const listOrders = (page = 1) => apiGet<{ data: AdminOrder[]; pagination: Page<AdminOrder>['pagination'] }>('/orders/admin/all', { page, limit: 20 });
export const updateOrder = (id: string, input: { status: string; paymentStatus?: string }) => apiPatch<AdminOrder, typeof input>(`/orders/${id}/status`, input);

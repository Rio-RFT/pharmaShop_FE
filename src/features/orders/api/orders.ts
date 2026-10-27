import { apiGet, apiPatch, apiPost } from '@/shared/api/client';

export type OrderItem = {
  id: string;
  medicineId: string;
  medicineName?: string;
  quantity: number;
  unitPrice: number | string;
  medicine?: { id?: string; name?: string; imageUrl?: string | null } | null;
};

export type Order = {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'SHIPPING' | 'COMPLETED' | 'CANCELLED' | string;
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | string;
  paymentMethod: 'COD' | 'BANK_TRANSFER' | 'PAYOS' | 'VNPAY' | 'MOMO' | string;
  totalAmount: number | string;
  subtotalAmount?: number | string;
  discountAmount?: number | string;
  couponCode?: string | null;
  paymentOrderCode?: number | string | null;
  receiverName?: string;
  receiverPhone?: string;
  shippingAddress?: string;
  cancellationReason?: string | null;
  createdAt: string;
  items: OrderItem[];
};

export type OrdersResult = { data: Order[]; pagination: { total: number; page: number; limit: number; totalPages: number } };

export function getMyOrders(page = 1) {
  return apiGet<OrdersResult>('/orders/my', { page, limit: 10 });
}

export function getOrderById(id: string) {
  return apiGet<Order>(`/orders/${encodeURIComponent(id)}`);
}

export function cancelOrder(id: string, reason?: string) {
  return apiPatch<Order, { reason?: string }>(`/orders/${encodeURIComponent(id)}/cancel`, reason ? { reason } : {});
}

export type CreateOrderInput = {
  items: { medicineId: string; quantity: number }[];
  receiverName: string;
  receiverPhone: string;
  shippingAddress: string;
  paymentMethod: 'COD' | 'PAYOS';
  couponCode?: string;
};

export function createOrder(input: CreateOrderInput) {
  return apiPost<Order, CreateOrderInput>('/orders', input);
}

export type PayOSAccount = {
  bankBin: string | null;
  accountNumber: string | null;
  accountName: string | null;
};

export type PayOSLink = {
  orderId: string;
  orderCode?: number | string | null;
  paymentLinkId?: string | null;
  amount: number | string;
  currency?: string | null;
  description?: string | null;
  checkoutUrl: string | null;
  qrCode?: string | null;
  account?: PayOSAccount | null;
  paymentStatus?: string;
  message?: string | null;
};

export function createPayOSLink(orderId: string) {
  return apiPost<PayOSLink, Record<string, never>>(`/payments/payos/${encodeURIComponent(orderId)}/link`, {});
}

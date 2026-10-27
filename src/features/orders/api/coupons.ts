import { apiPost } from '@/shared/api/client';

export type CouponPreview = {
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT' | string;
  discountValue: number | string;
  subtotalAmount: number | string;
  discountAmount: number | string;
  totalAmount: number | string;
  expiresAt: string | null;
};

export type CouponPreviewItem = { medicineId: string; quantity: number };

export function validateCoupon(code: string, items: CouponPreviewItem[]) {
  return apiPost<CouponPreview, { code: string; items: CouponPreviewItem[] }>('/coupons/validate', { code, items });
}

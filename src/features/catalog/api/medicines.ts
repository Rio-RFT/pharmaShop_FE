import { apiGet } from '@/shared/api/client';

export type Medicine = {
  id: string;
  name: string;
  activeIngredient: string;
  category: string;
  price: number | string;
  stockQuantity: number;
  unit: string;
  packaging: string;
  indications?: string | null;
  contraindications?: string | null;
  dosage?: string | null;
  sideEffects?: string | null;
  manufacturer?: string | null;
  imageUrl?: string | null;
};

export type MedicineSearchResult = {
  data: Medicine[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
};

export function searchMedicines(params: {
  keyword?: string;
  category?: string;
  page?: number;
  limit?: number;
  sortBy?: 'price' | 'name' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}) {
  return apiGet<MedicineSearchResult>('/medicines/search', { ...params, page: params.page ?? 1, limit: params.limit ?? 12 });
}

export function getMedicineCategories() {
  return apiGet<string[]>('/medicines/categories');
}

export function getMedicine(id: string) {
  return apiGet<Medicine>(`/medicines/${encodeURIComponent(id)}`);
}

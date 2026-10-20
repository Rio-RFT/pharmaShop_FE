import { apiGet, apiPost, apiPatch, apiDelete } from '@/shared/api/client';

export type Address = {
  id: string;
  receiverName: string;
  phone: string;
  street: string;
  ward: string;
  district: string;
  province: string;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type AddressInput = Omit<Address, 'id' | 'createdAt' | 'updatedAt'>;

export const getAddresses = () => apiGet<Address[]>('/users/addresses');
export const createAddress = (input: AddressInput) => apiPost<Address, AddressInput>('/users/addresses', input);
export const updateAddress = (id: string, input: Partial<AddressInput>) => apiPatch<Address, Partial<AddressInput>>(`/users/addresses/${encodeURIComponent(id)}`, input);
export const deleteAddress = (id: string) => apiDelete<{ message: string }>(`/users/addresses/${encodeURIComponent(id)}`);

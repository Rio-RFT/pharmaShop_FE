import { fetchUntilResponse, logApiResponse } from '@/shared/api/client';

const API_BASE_URL = 'https://provinces.open-api.vn/api/v1';

export type DivisionOption = { code: number; name: string };
export type Ward = DivisionOption & { district_code: number };
export type District = DivisionOption & { province_code: number; wards: Ward[] };
export type Province = DivisionOption & { districts: District[] };

export async function getProvinces(): Promise<DivisionOption[]> {
  const data = await requestJson<unknown>(`${API_BASE_URL}/p/`);
  if (!Array.isArray(data)) throw new Error('Dữ liệu tỉnh/thành không đúng định dạng.');
  return data.filter(isDivisionOption);
}

export async function getProvinceDetail(code: number): Promise<Province> {
  const data = await requestJson<unknown>(`${API_BASE_URL}/p/${code}?depth=3`);
  if (!isProvince(data)) throw new Error('Dữ liệu quận/huyện, phường/xã không đúng định dạng.');
  return data;
}

async function requestJson<T>(url: string): Promise<T> {
  const result = await fetchUntilResponse(url, { headers: { Accept: 'application/json' } }, 'GET');
  const data: unknown = await result.response.json().catch(() => undefined);
  logApiResponse(url, 'GET', result, result.response.status, data);
  if (!result.response.ok) throw new Error(`Không tải được dữ liệu địa giới (${result.response.status}).`);
  return data as T;
}

function isDivisionOption(value: unknown): value is DivisionOption {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.code === 'number' && typeof entry.name === 'string';
}

function isProvince(value: unknown): value is Province {
  if (!isDivisionOption(value)) return false;
  const entry = value as Record<string, unknown>;
  return Array.isArray(entry.districts) && entry.districts.every((district) => {
    if (!isDivisionOption(district) || typeof district !== 'object' || district === null) return false;
    const candidate = district as Record<string, unknown>;
    return typeof candidate.province_code === 'number' && Array.isArray(candidate.wards) && candidate.wards.every((ward) =>
      isDivisionOption(ward) && typeof ward === 'object' && ward !== null && typeof (ward as Record<string, unknown>).district_code === 'number');
  });
}

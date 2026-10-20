import { clearCredentials, notifySessionExpired, readCredential, saveCredentials } from '@/features/auth/token-storage';

const configuredBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
if (!configuredBaseUrl) {
  throw new Error('Thiếu EXPO_PUBLIC_API_URL. Hãy cấu hình URL API trong file .env rồi khởi động lại Expo.');
}
export const API_BASE_URL = configuredBaseUrl.replace(/\/+$/, '');

type ApiEnvelope<T> = { success: boolean; statusCode: number; data: T; timestamp: string };

export class ApiError extends Error {
  constructor(message: string, readonly statusCode?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiGet<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${API_BASE_URL}${path}`);
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  });
  return apiRequest<T>(url.toString());
}

export async function apiPost<TResponse, TBody>(path: string, body: TBody): Promise<TResponse> {
  return apiRequest<TResponse>(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function apiPatch<TResponse, TBody>(path: string, body: TBody): Promise<TResponse> {
  return apiRequest<TResponse>(`${API_BASE_URL}${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export async function apiDelete<TResponse>(path: string): Promise<TResponse> {
  return apiRequest<TResponse>(`${API_BASE_URL}${path}`, { method: 'DELETE' });
}

async function apiRequest<T>(url: string, init?: RequestInit, allowRefresh = true): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const headers = new Headers(init?.headers);
    const accessToken = await readCredential('access');
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    const response = await fetch(url, { ...init, headers, signal: controller.signal });
    if (response.status === 401 && allowRefresh && !url.endsWith('/auth/refresh-token')) {
      const refreshed = await refreshSession();
      if (refreshed) return apiRequest<T>(url, init, false);
      await clearCredentials();
      notifySessionExpired();
    }
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const message = getErrorMessage(payload) ?? `Yêu cầu thất bại (${response.status}).`;
      throw new ApiError(message, response.status);
    }
    if (!isApiEnvelope<T>(payload)) throw new ApiError('Phản hồi API không đúng định dạng.');
    return payload.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new ApiError('Kết nối quá thời gian chờ. Vui lòng thử lại.');
    throw new ApiError('Không thể kết nối máy chủ. Hãy kiểm tra mạng và địa chỉ API.');
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshSession(): Promise<boolean> {
  const refreshToken = await readCredential('refresh');
  const serializedUser = await readCredential('user');
  if (!refreshToken || !serializedUser) return false;
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh-token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
    const payload: unknown = await response.json();
    if (!response.ok || !isApiEnvelope<{ accessToken: string; refreshToken: string }>(payload)) return false;
    await saveCredentials({ ...payload.data, user: serializedUser });
    return true;
  } catch { return false; }
}

function isApiEnvelope<T>(value: unknown): value is ApiEnvelope<T> {
  if (typeof value !== 'object' || value === null) return false;
  const envelope = value as Record<string, unknown>;
  return envelope.success === true && 'data' in envelope;
}

function getErrorMessage(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const message = (value as Record<string, unknown>).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.filter((item): item is string => typeof item === 'string').join('\n');
  return undefined;
}

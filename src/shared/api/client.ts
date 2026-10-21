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

export async function apiDeleteWithBody<TResponse, TBody>(path: string, body: TBody): Promise<TResponse> {
  return apiRequest<TResponse>(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function apiRequest<T>(url: string, init?: RequestInit, allowRefresh = true): Promise<T> {
  try {
    const headers = new Headers(init?.headers);
    const accessToken = await readCredential('access');
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    const method = (init?.method ?? 'GET').toUpperCase();
    // Reads and login can safely be retried when the connection times out.
    // Do not replay other writes: a timed-out order/cart mutation may have succeeded server-side.
    const canRetry = method === 'GET' || (method === 'POST' && /\/auth\/login(?:\?|$)/.test(url));
    let response: Response;

    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        response = await fetch(url, { ...init, headers, signal: controller.signal });
      } catch (error) {
        if (!canRetry || !isRetryableNetworkFailure(error)) throw error;
        await wait(getRetryDelay(attempt));
        continue;
      } finally {
        clearTimeout(timeout);
      }

      if (!canRetry || !isRetryableStatus(response.status)) break;
      await wait(getRetryDelay(attempt));
    }

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
  }
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 502 || status === 503 || status === 504;
}

function getRetryDelay(attempt: number) {
  const cappedBackoff = Math.min(1_000 * 2 ** Math.min(attempt, 5), 30_000);
  return cappedBackoff + Math.floor(Math.random() * 500);
}

function isRetryableNetworkFailure(error: unknown) {
  return error instanceof TypeError || (error instanceof Error && error.name === 'AbortError');
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

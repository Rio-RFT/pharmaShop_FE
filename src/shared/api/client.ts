import { clearCredentials, notifySessionExpired, readCredential, saveCredentials } from '@/features/auth/token-storage';
import { Platform } from 'react-native';

const configuredBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
if (!configuredBaseUrl) {
  throw new Error('Thiếu EXPO_PUBLIC_API_URL. Hãy cấu hình URL API trong file .env rồi khởi động lại Expo.');
}
function resolveApiBaseUrl(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  if (Platform.OS !== 'android') return normalizedBaseUrl;

  try {
    const url = new URL(normalizedBaseUrl);
    if (url.hostname === 'localhost') url.hostname = '10.0.2.2';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return normalizedBaseUrl;
  }
}

export const API_BASE_URL = resolveApiBaseUrl(configuredBaseUrl);
const REQUEST_TIMEOUT_MS = 60_000;

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

export async function apiDeleteWithBody<TResponse, TBody>(path: string, body: TBody, options?: { maxDurationMs?: number }): Promise<TResponse> {
  return apiRequest<TResponse>(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, true, options?.maxDurationMs ? Date.now() + options.maxDurationMs : undefined);
}

async function apiRequest<T>(url: string, init?: RequestInit, allowRefresh = true, deadlineAt?: number): Promise<T> {
  try {
    const headers = new Headers(init?.headers);
    const accessToken = await readCredential('access');
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    const method = (init?.method ?? 'GET').toUpperCase();
    const result = await fetchUntilResponse(url, { ...init, headers }, method, deadlineAt);
    const response = result.response;

    if (response.status === 401 && allowRefresh && !url.endsWith('/auth/refresh-token')) {
      const refreshed = await refreshSession(deadlineAt);
      if (refreshed) return apiRequest<T>(url, init, false, deadlineAt);
      await clearCredentials();
      notifySessionExpired();
    }
    const payload: unknown = await response.json().catch(() => undefined);
    logApiResponse(url, method, result, response.status, payload);
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

function getRetryDelay(attempt: number) {
  const cappedBackoff = Math.min(1_000 * 2 ** Math.min(attempt - 1, 3), 5_000);
  return cappedBackoff + Math.floor(Math.random() * 250);
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function refreshSession(deadlineAt?: number): Promise<boolean> {
  const refreshToken = await readCredential('refresh');
  const serializedUser = await readCredential('user');
  if (!refreshToken || !serializedUser) return false;
  const result = await fetchUntilResponse(`${API_BASE_URL}/auth/refresh-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  }, 'POST', deadlineAt);
  const response = result.response;
  const payload: unknown = await response.json().catch(() => undefined);
  logApiResponse(`${API_BASE_URL}/auth/refresh-token`, 'POST', result, response.status, payload);
  if (!response.ok || !isApiEnvelope<{ accessToken: string; refreshToken: string }>(payload)) return false;
  await saveCredentials({ ...payload.data, user: serializedUser });
  return true;
}

export async function fetchUntilResponse(url: string, init: RequestInit, method: string, deadlineAt?: number): Promise<{ response: Response; attempt: number; durationMs: number }> {
  const startedAt = Date.now();
  let attempt = 0;
  while (true) {
    const remainingMs = deadlineAt === undefined ? REQUEST_TIMEOUT_MS : deadlineAt - Date.now();
    if (remainingMs <= 0) throw new ApiError('Yêu cầu đã hết thời gian chờ.');
    attempt += 1;
    const controller = new AbortController();
    const attemptStartedAt = Date.now();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, Math.min(REQUEST_TIMEOUT_MS, remainingMs));
    let response: Response | undefined;
    const requestUrl = sanitizeUrl(url);
    devLog('request', {
      method,
      url: requestUrl,
      attempt,
      data: loggableRequestBody(init.body),
    });
    let requestError: unknown;
    try {
      response = await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      requestError = error;
      // Retry transport failures and timeouts until the server returns an HTTP response.
    } finally {
      clearTimeout(timeout);
    }
    if (response) return { response, attempt, durationMs: Date.now() - startedAt };
    const retryDelayMs = Math.min(getRetryDelay(attempt), deadlineAt === undefined ? Number.POSITIVE_INFINITY : Math.max(0, deadlineAt - Date.now()));
    devLog('retry', {
      method,
      url: requestUrl,
      attempt,
      attemptDurationMs: Date.now() - attemptStartedAt,
      timedOut,
      retryInMs: retryDelayMs,
      error: describeFetchError(requestError),
    });
    await wait(retryDelayMs);
  }
}

export function logApiResponse(
  url: string,
  method: string,
  result: { attempt: number; durationMs: number },
  status: number,
  data: unknown,
) {
  devLog('response', {
    method,
    url: sanitizeUrl(url),
    attempt: result.attempt,
    status,
    durationMs: result.durationMs,
    data: redactSensitiveData(data),
  });
}

function devLog(event: 'request' | 'response' | 'retry', details: Record<string, unknown>) {
  if (__DEV__) console.log(`[API] ${event}`, details);
}

function loggableRequestBody(body: BodyInit | null | undefined): unknown {
  if (!body) return undefined;
  if (typeof body !== 'string') return '[non-text body omitted]';
  try {
    return redactSensitiveData(JSON.parse(body) as unknown);
  } catch {
    return '[non-JSON body omitted]';
  }
}

function redactSensitiveData(value: unknown, key = ''): unknown {
  if (isSensitiveKey(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redactSensitiveData(item));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redactSensitiveData(childValue, childKey)]));
  }
  if (typeof value === 'string') return redactSensitiveText(value);
  return value;
}

function isSensitiveKey(key: string) {
  return /password|token|secret|otp|authorization|email|phone|address|identifier|receiver|payment|card|credential|full.?name|api.?key|content|message|checkout.?url|qr.?code|account.?number|account.?name|bank.?bin/i.test(key);
}

function sanitizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.searchParams.forEach((_value, key) => {
      if (isSensitiveKey(key)) url.searchParams.set(key, '[REDACTED]');
    });
    return url.toString();
  } catch {
    return '[invalid URL]';
  }
}

function redactSensitiveText(value: string) {
  return value
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/\bExponentPushToken\[[^\]]+\]/g, 'ExponentPushToken[REDACTED]')
    .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, '[REDACTED JWT]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED EMAIL]')
    .replace(/\b(?:\+?84|0)(?:[\s.-]?\d){8,10}\b/g, '[REDACTED PHONE]');
}

function describeFetchError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: redactSensitiveText(error.message) };
  return redactSensitiveText(String(error));
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

import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL } from '@/shared/api/client';
import { onCredentialsChanged, readCredential } from '@/features/auth/token-storage';

export type PaymentStatusEvent = {
  orderId: string;
  status?: string;
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | string;
  paymentMethod?: string;
  totalAmount?: number | string;
  updatedAt?: string;
};

type Listener = (event: PaymentStatusEvent | null) => void;
const listeners = new Set<Listener>();
let socket: Socket | null = null;
let connecting = false;
let generation = 0;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

function stopSocket() {
  generation += 1;
  connecting = false;
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

async function ensureSocket() {
  if (socket || connecting || listeners.size === 0) return;
  connecting = true;
  const currentGeneration = ++generation;
  const token = await readCredential('access').catch(() => null);
  if (currentGeneration !== generation || listeners.size === 0 || !token) {
    if (currentGeneration === generation) connecting = false;
    return;
  }

  const socketUrl = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
  const client = io(socketUrl, {
    autoConnect: false,
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
    timeout: 15_000,
  });
  socket = client;
  connecting = false;

  client.on('connect', () => {
    // Re-fetch after initial connection and every reconnect to cover missed events.
    listeners.forEach((listener) => listener(null));
  });
  client.on('order:payment_status_changed', (payload: unknown) => {
    const event = parsePaymentStatusEvent(payload);
    if (event) listeners.forEach((listener) => listener(event));
  });
  client.connect();
}

function parsePaymentStatusEvent(payload: unknown): PaymentStatusEvent | null {
  if (!isRecord(payload)) return null;
  if (payload.success === false) return null;
  const data = isRecord(payload.data) ? payload.data : payload;
  if (typeof data.orderId !== 'string' || typeof data.paymentStatus !== 'string') return null;
  if (!['PENDING', 'PAID', 'FAILED', 'REFUNDED'].includes(data.paymentStatus)) return null;
  return {
    orderId: data.orderId,
    paymentStatus: data.paymentStatus,
    ...(typeof data.status === 'string' ? { status: data.status } : {}),
    ...(typeof data.paymentMethod === 'string' ? { paymentMethod: data.paymentMethod } : {}),
    ...(typeof data.totalAmount === 'number' || typeof data.totalAmount === 'string' ? { totalAmount: data.totalAmount } : {}),
    ...(typeof data.updatedAt === 'string' ? { updatedAt: data.updatedAt } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

onCredentialsChanged(() => {
  if (listeners.size === 0) return;
  stopSocket();
  void ensureSocket();
});

function subscribe(listener: Listener) {
  const wasEmpty = listeners.size === 0;
  listeners.add(listener);
  if (wasEmpty) {
    appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') listeners.forEach((current) => current(null));
    });
  }
  void ensureSocket();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      appStateSubscription?.remove();
      appStateSubscription = null;
      stopSocket();
    }
  };
}

/** Shares one authenticated Socket.IO connection across mounted order/payment screens. */
export function usePaymentStatusSync(orderId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    return subscribe((event) => {
      if (event && orderId && event.orderId !== orderId) return;
      if (event) void queryClient.invalidateQueries({ queryKey: ['orders', 'detail', event.orderId] });
      else if (orderId) void queryClient.invalidateQueries({ queryKey: ['orders', 'detail', orderId] });
      else void queryClient.invalidateQueries({ queryKey: ['orders', 'detail'] });
      void queryClient.invalidateQueries({ queryKey: ['orders', 'my'] });
    });
  }, [orderId, queryClient, userId]);
}


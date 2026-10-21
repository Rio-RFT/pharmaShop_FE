import { apiGet, apiPost } from '@/shared/api/client';

export type NotificationBlock =
  | { type: 'HEADING' | 'TEXT'; text: string }
  | { type: 'IMAGE'; url: string; altText?: string }
  | { type: 'BUTTON'; label: string; url: string }
  | { type: 'DIVIDER' };
export type NotificationType = 'SHORT' | 'PAGE';
export type NotificationSummary = {
  id: string; readAt: string | null; createdAt: string;
  notification: { id: string; type: NotificationType; title: string; body: string; createdAt: string; category?: 'SYSTEM' | 'EVENT'; imageUrl?: string | null };
};
export type NotificationPage = { items: NotificationSummary[]; unreadCount: number; page: number; limit: number; total: number; hasMore: boolean };
export type NotificationDetail = {
  id: string; type: NotificationType; title: string; body: string; content: NotificationBlock[] | null;
  createdAt: string; readAt: string | null;
};
export type BroadcastInput = { type: NotificationType; title: string; body: string; content?: NotificationBlock[] };
export type BroadcastResult = { id: string; type: NotificationType; title: string; body: string; recipientCount: number; deviceCount: number; createdAt: string };

export const getNotifications = (page = 1) => apiGet<NotificationPage>('/notifications', { page, limit: 20 });
export const getNotificationDetail = (id: string) => apiGet<NotificationDetail>(`/notifications/${encodeURIComponent(id)}`);
export const broadcastNotification = (input: BroadcastInput) => apiPost<BroadcastResult, BroadcastInput>('/notifications/admin/broadcast', input);

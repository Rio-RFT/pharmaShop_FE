import { apiGet, apiPost } from '@/shared/api/client';

export type SupportConversation = {
  id: string;
  status: 'OPEN' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
};

export type SupportMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: 'CUSTOMER' | 'PHARMACIST' | 'ADMIN';
  content: string;
  clientMessageId?: string;
  createdAt: string;
};

export type SupportMessagePage = { items: SupportMessage[]; nextCursor: string | null };

export const getOrCreateSupportConversation = () =>
  apiPost<SupportConversation, Record<string, never>>('/chat/conversations/support', {});

export const getSupportMessages = (conversationId: string) =>
  apiGet<SupportMessagePage>(`/chat/conversations/${encodeURIComponent(conversationId)}/messages`, { limit: 50 });

export const sendSupportMessage = (conversationId: string, input: { clientMessageId: string; content: string }) =>
  apiPost<SupportMessage, typeof input>(`/chat/conversations/${encodeURIComponent(conversationId)}/messages`, input);

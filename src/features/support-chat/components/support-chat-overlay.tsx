import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { io, type Socket } from 'socket.io-client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/features/auth/auth-provider';
import { readCredential } from '@/features/auth/token-storage';
import { getOrCreateSupportConversation, getSupportMessages, sendSupportMessage, type SupportMessage, type SupportMessagePage } from '@/features/support-chat/api/chat';
import { ApiError, API_BASE_URL } from '@/shared/api/client';
import { useTheme } from '@/hooks/use-theme';

const messagesKey = (conversationId: string) => ['support-chat', 'messages', conversationId] as const;

export function SupportChatOverlay() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  return <>
    <View pointerEvents="box-none" style={styles.floatingLayer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Chat với cửa hàng"
        onPress={() => setVisible(true)}
        style={({ pressed }) => [styles.floatingButton, { backgroundColor: theme.tint, opacity: pressed ? 0.82 : 1 }]}
      >
        <SymbolView name={{ ios: 'bubble.left.and.bubble.right.fill', android: 'chat', web: 'chat' }} size={24} tintColor="#FFFFFF" />
      </Pressable>
    </View>

    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setVisible(false)}>
      <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Đóng cửa sổ chat" onPress={() => setVisible(false)} style={StyleSheet.absoluteFill} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardArea}>
          <ThemedView style={[styles.panel, { backgroundColor: theme.background }]}>
            <SafeAreaView edges={['bottom']} style={styles.panelSafe}>
              <View style={[styles.header, { borderBottomColor: theme.backgroundElement }]}>
                <View style={styles.headerCopy}>
                  <ThemedText style={styles.heading}>Chat với cửa hàng</ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.subheading}>{user ? 'Nhân viên hỗ trợ PharmaShop' : 'Đăng nhập để bắt đầu trò chuyện'}</ThemedText>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Đóng chat" hitSlop={10} onPress={() => setVisible(false)} style={styles.closeButton}>
                  <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={19} tintColor={theme.textSecondary} />
                </Pressable>
              </View>

              {!visible ? null : !user ? (
                <View style={styles.loginGate}>
                  <View style={[styles.chatIcon, { backgroundColor: theme.backgroundSelected }]}>
                    <SymbolView name={{ ios: 'bubble.left.and.bubble.right.fill', android: 'chat', web: 'chat' }} size={30} tintColor={theme.tint} />
                  </View>
                  <ThemedText style={styles.gateTitle}>Cần đăng nhập để chat</ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.gateBody}>Đăng nhập để trao đổi trực tiếp với cửa hàng và xem tin nhắn mới theo thời gian thực.</ThemedText>
                  <Pressable accessibilityRole="button" onPress={() => { setVisible(false); router.push('/auth/login'); }} style={[styles.primaryButton, { backgroundColor: theme.tint }]}>
                    <ThemedText style={styles.primaryButtonText}>Đăng nhập để chat</ThemedText>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => { setVisible(false); router.push('/auth/register'); }} style={styles.registerButton}>
                    <ThemedText style={[styles.registerText, { color: theme.tint }]}>Tạo tài khoản</ThemedText>
                  </Pressable>
                </View>
              ) : <AuthenticatedSupportChat key={user.id} userId={user.id} />}
            </SafeAreaView>
          </ThemedView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  </>;
}

function AuthenticatedSupportChat({ userId }: { userId: string }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [socketState, setSocketState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const listRef = useRef<FlatList<SupportMessage>>(null);
  const conversation = useQuery({ queryKey: ['support-chat', 'conversation', userId], queryFn: getOrCreateSupportConversation });
  const conversationId = conversation.data?.id;
  const messagesQuery = useQuery({ queryKey: messagesKey(conversationId ?? ''), queryFn: () => getSupportMessages(conversationId!), enabled: !!conversationId });
  const socketUrl = useMemo(() => {
    const url = new URL(API_BASE_URL);
    url.pathname = url.pathname.replace(/\/api\/v\d+\/?$/, '') || '/';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  }, []);
  const messagePage = messagesQuery.data;

  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    let socket: Socket | null = null;

    const connect = async () => {
      const token = await readCredential('access');
      if (!active || !token) {
        if (active) setSocketState('disconnected');
        return;
      }
      socket = io(socketUrl, { autoConnect: false, auth: { token }, reconnection: true, reconnectionDelay: 1_000, reconnectionDelayMax: 10_000, timeout: 15_000 });
      socket.on('connect', () => {
        setSocketState('connected');
        socket?.emit('chat:join', { conversationId });
      });
      socket.on('disconnect', () => setSocketState('disconnected'));
      socket.on('connect_error', () => setSocketState('disconnected'));
      socket.on('chat:message', (payload: unknown) => {
        const message = parseSocketMessage(payload);
        if (!message || message.conversationId !== conversationId) return;
        queryClient.setQueryData<SupportMessagePage>(messagesKey(conversationId), (current) => ({
          items: appendUniqueMessage(current?.items ?? [], message),
          nextCursor: current?.nextCursor ?? null,
        }));
      });
      socket.on('chat:joined', () => { void queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) }); });
      socket.connect();
    };

    void connect();
    return () => {
      active = false;
      socket?.emit('chat:leave', { conversationId });
      socket?.removeAllListeners();
      socket?.disconnect();
    };
  }, [conversationId, queryClient, socketUrl]);

  const messages = messagePage?.items ?? [];
  const send = async () => {
    const content = draft.trim();
    if (!content || !conversationId || sending || conversation.data?.status === 'CLOSED') return;
    setSending(true);
    setSendError(null);
    const clientMessageId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const message = await sendSupportMessage(conversationId, { clientMessageId, content });
      queryClient.setQueryData<SupportMessagePage>(messagesKey(conversationId), (current) => ({
        items: appendUniqueMessage(current?.items ?? [], message),
        nextCursor: current?.nextCursor ?? null,
      }));
      setDraft('');
    } catch (error) {
      setSendError(error instanceof ApiError ? error.message : 'Không gửi được tin nhắn. Vui lòng thử lại.');
    } finally {
      setSending(false);
    }
  };

  return <View style={styles.chatBody}>
    <View style={styles.connectionStatus}>
      <View style={[styles.statusDot, { backgroundColor: socketState === 'connected' ? '#159570' : theme.textSecondary }]} />
      <ThemedText themeColor="textSecondary" style={styles.statusText}>{socketState === 'connected' ? 'Đang kết nối realtime' : socketState === 'connecting' ? 'Đang kết nối…' : 'Mất kết nối realtime'}</ThemedText>
    </View>

    {conversation.isLoading ? <View style={styles.centerState}><ActivityIndicator color={theme.tint} /><ThemedText themeColor="textSecondary" style={styles.stateText}>Đang mở cuộc trò chuyện…</ThemedText></View>
      : conversation.error ? <View style={styles.centerState}><ThemedText style={styles.gateTitle}>Chưa kết nối được chat</ThemedText><ThemedText themeColor="textSecondary" style={styles.stateText}>{conversation.error instanceof ApiError && conversation.error.statusCode === 404 ? 'Máy chủ chưa bật tính năng chat. Hãy cập nhật backend rồi thử lại.' : conversation.error instanceof ApiError ? conversation.error.message : 'Không tải được cuộc trò chuyện.'}</ThemedText><Pressable accessibilityRole="button" onPress={() => void conversation.refetch()} style={[styles.retryButton, { borderColor: theme.tint }]}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Thử lại</ThemedText></Pressable></View>
      : messagesQuery.isLoading ? <View style={styles.centerState}><ActivityIndicator color={theme.tint} /><ThemedText themeColor="textSecondary" style={styles.stateText}>Đang tải tin nhắn…</ThemedText></View>
        : messagesQuery.error ? <View style={styles.centerState}><ThemedText style={styles.gateTitle}>Không tải được tin nhắn</ThemedText><ThemedText themeColor="textSecondary" style={styles.stateText}>{messagesQuery.error instanceof ApiError ? messagesQuery.error.message : 'Hãy thử tải lại cuộc trò chuyện.'}</ThemedText><Pressable accessibilityRole="button" onPress={() => void messagesQuery.refetch()} style={[styles.retryButton, { borderColor: theme.tint }]}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Tải lại</ThemedText></Pressable></View>
          : <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messageList}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<View style={styles.emptyMessages}><ThemedText style={styles.gateTitle}>Bắt đầu trò chuyện</ThemedText><ThemedText themeColor="textSecondary" style={styles.stateText}>Gửi tin nhắn để được cửa hàng hỗ trợ.</ThemedText></View>}
            renderItem={({ item }) => {
              const mine = item.senderId === userId;
              return <View style={[styles.messageRow, mine ? styles.mineRow : styles.theirsRow]}><View style={[styles.messageBubble, mine ? { backgroundColor: theme.tint } : { backgroundColor: theme.backgroundElement }]}><ThemedText style={[styles.messageText, mine ? styles.mineText : { color: theme.text }]}>{item.content}</ThemedText><ThemedText style={[styles.messageTime, mine ? styles.mineTime : { color: theme.textSecondary }]}>{formatMessageTime(item.createdAt)}</ThemedText></View></View>;
            }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />}

    {conversation.data?.status === 'CLOSED' ? <View style={[styles.closedNotice, { backgroundColor: theme.backgroundElement }]}><ThemedText themeColor="textSecondary">Cuộc trò chuyện đã kết thúc.</ThemedText></View> : null}
    {sendError ? <ThemedText accessibilityRole="alert" style={styles.sendError}>{sendError}</ThemedText> : null}
    {conversation.data?.status !== 'CLOSED' && conversation.data ? <View style={[styles.composer, { borderTopColor: theme.backgroundElement }]}><TextInput value={draft} onChangeText={setDraft} placeholder="Nhập tin nhắn…" placeholderTextColor={theme.textSecondary} multiline maxLength={2000} accessibilityLabel="Nội dung tin nhắn" style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]} /><Pressable accessibilityRole="button" accessibilityLabel="Gửi tin nhắn" disabled={!draft.trim() || sending} onPress={() => void send()} style={[styles.sendButton, { backgroundColor: theme.tint, opacity: !draft.trim() || sending ? 0.55 : 1 }]}>{sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <SymbolView name={{ ios: 'arrow.up', android: 'send', web: 'send' }} size={18} tintColor="#FFFFFF" />}</Pressable></View> : null}
  </View>;
}

function appendUniqueMessage(items: SupportMessage[], message: SupportMessage) {
  const exists = items.some((item) => item.id === message.id || (message.clientMessageId && item.clientMessageId === message.clientMessageId));
  if (exists) return items.map((item) => item.clientMessageId === message.clientMessageId ? message : item);
  return [...items, message];
}

function parseSocketMessage(value: unknown): SupportMessage | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = 'data' in value ? value.data : value;
  if (!candidate || typeof candidate !== 'object') return null;
  const message = candidate as Partial<SupportMessage>;
  if (typeof message.id !== 'string' || typeof message.conversationId !== 'string' || typeof message.senderId !== 'string' || typeof message.content !== 'string' || typeof message.createdAt !== 'string') return null;
  return message as SupportMessage;
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  floatingLayer: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', alignItems: 'flex-end', paddingRight: 17, paddingBottom: 92, zIndex: 50 },
  floatingButton: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12, 24, 20, 0.35)' },
  keyboardArea: { width: '100%', alignItems: 'center' },
  panel: { width: '100%', maxWidth: 520, height: '78%', maxHeight: 700, overflow: 'hidden', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  panelSafe: { flex: 1 },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  headerCopy: { flex: 1 },
  heading: { fontSize: 17, fontWeight: '800' },
  subheading: { fontSize: 12, marginTop: 3 },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  loginGate: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  chatIcon: { width: 68, height: 68, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  gateTitle: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  gateBody: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 },
  primaryButton: { minHeight: 48, width: '100%', borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  registerButton: { paddingHorizontal: 16, paddingVertical: 13 },
  registerText: { fontSize: 14, fontWeight: '700' },
  chatBody: { flex: 1 },
  connectionStatus: { height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 28 },
  stateText: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  retryButton: { minHeight: 40, minWidth: 110, paddingHorizontal: 16, borderWidth: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  messageList: { paddingHorizontal: 14, paddingVertical: 10, flexGrow: 1, justifyContent: 'flex-end' },
  emptyMessages: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  messageRow: { width: '100%', marginVertical: 4 },
  mineRow: { alignItems: 'flex-end' },
  theirsRow: { alignItems: 'flex-start' },
  messageBubble: { maxWidth: '82%', borderRadius: 16, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 7 },
  messageText: { fontSize: 14, lineHeight: 20 },
  mineText: { color: '#FFFFFF' },
  messageTime: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  mineTime: { color: 'rgba(255,255,255,0.75)' },
  closedNotice: { alignItems: 'center', padding: 10 },
  sendError: { color: '#B42318', fontSize: 12, paddingHorizontal: 14, paddingTop: 6 },
  composer: { minHeight: 64, flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 9, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, maxHeight: 100, minHeight: 42, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 18, fontSize: 14 },
  sendButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});

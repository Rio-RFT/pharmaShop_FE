import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { io, type Socket } from 'socket.io-client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/features/auth/auth-provider';
import { onCredentialsChanged, readCredential } from '@/features/auth/token-storage';
import { closeSupportConversation, getOrCreateSupportConversation, getSupportMessages, sendSupportMessage, type SupportConversation, type SupportMessage, type SupportMessagePage } from '@/features/support-chat/api/chat';
import { ApiError, API_BASE_URL } from '@/shared/api/client';
import { useTheme } from '@/hooks/use-theme';

const messagesKey = (conversationId: string) => ['support-chat', 'messages', conversationId] as const;

export function SupportChatOverlay() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const closingConversation = useRef(false);
  const closeConversation = async () => {
    if (!user || closingConversation.current) return;
    closingConversation.current = true;
    try {
      const queryKey = ['support-chat', 'conversation', user.id] as const;
      const conversation = queryClient.getQueryData<SupportConversation>(queryKey)
        ?? await queryClient.fetchQuery({ queryKey, queryFn: getOrCreateSupportConversation });
      if (!conversation) throw new Error('Conversation unavailable');
      if (conversation.status !== 'ARCHIVED' && conversation.status !== 'CLOSED') {
        const updated = await closeSupportConversation(conversation.id);
        queryClient.setQueryData(queryKey, updated);
        await queryClient.invalidateQueries({ queryKey });
      }
      setVisible(false);
    } catch (error) {
      Alert.alert('Chưa thể kết thúc trò chuyện', error instanceof ApiError ? error.message : 'Không gửi được yêu cầu kết thúc. Vui lòng thử lại.');
    } finally {
      closingConversation.current = false;
    }
  };
  const requestClose = () => {
    if (!user) { setVisible(false); return; }
    Alert.alert(
      'Kết thúc cuộc trò chuyện?',
      'Cuộc trò chuyện của bạn sẽ được lưu trữ và không nhận thêm tin nhắn mới.',
      [
        { text: 'Tiếp tục trò chuyện', style: 'cancel' },
        { text: 'Kết thúc cuộc trò chuyện', style: 'destructive', onPress: () => { void closeConversation(); } },
      ],
    );
  };

  return <>
    <View pointerEvents="box-none" style={[styles.floatingLayer, Platform.OS === 'web' && styles.webFloatingLayer]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Chat với cửa hàng"
        onPress={() => {
          if (user?.role === 'ADMIN') {
            router.push('/admin?section=chat' as import('expo-router').Href);
            return;
          }
          setVisible(true);
        }}
        style={({ pressed }) => [styles.floatingButton, { backgroundColor: theme.tint, opacity: pressed ? 0.82 : 1 }]}
      >
        <SymbolView name={{ ios: 'bubble.left.and.bubble.right.fill', android: 'chat', web: 'chat' }} size={24} tintColor="#FFFFFF" />
      </Pressable>
    </View>

    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={requestClose}>
      <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Đóng cửa sổ chat" onPress={requestClose} style={StyleSheet.absoluteFill} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardArea}>
          <ThemedView style={[styles.panel, { backgroundColor: theme.background }]}>
            <SafeAreaView edges={['bottom']} style={styles.panelSafe}>
              <View style={[styles.header, { borderBottomColor: theme.backgroundElement }]}>
                <View style={styles.headerCopy}>
                  <ThemedText style={styles.heading}>Chat với cửa hàng</ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.subheading}>{user ? 'Nhân viên hỗ trợ PharmaShop' : 'Đăng nhập để bắt đầu trò chuyện'}</ThemedText>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Đóng chat" hitSlop={10} onPress={requestClose} style={styles.closeButton}>
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
  const [socketError, setSocketError] = useState<string | null>(null);
  const [staffTyping, setStaffTyping] = useState('');
  const [assignmentNotice, setAssignmentNotice] = useState('');
  const [socketState, setSocketState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const listRef = useRef<FlatList<SupportMessage>>(null);
  const socketRef = useRef<Socket | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staffTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAt = useRef(0);
  const typingActive = useRef(false);
  const assignmentKey = useRef('');
  const [credentialRevision, setCredentialRevision] = useState(0);
  const conversation = useQuery({ queryKey: ['support-chat', 'conversation', userId], queryFn: getOrCreateSupportConversation });
  const conversationId = conversation.data?.id;
  const conversationStatusRef = useRef(conversation.data?.status);
  conversationStatusRef.current = conversation.data?.status ?? conversationStatusRef.current;
  const messagesQuery = useQuery({ queryKey: messagesKey(conversationId ?? ''), queryFn: () => getSupportMessages(conversationId!), enabled: !!conversationId });
  const socketUrl = useMemo(() => {
    const url = new URL(API_BASE_URL);
    url.pathname = url.pathname.replace(/\/api\/v\d+\/?$/, '') || '/';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  }, []);
  const messagePage = messagesQuery.data;

  useEffect(() => onCredentialsChanged(() => setCredentialRevision((revision) => revision + 1)), []);

  const stopTyping = useCallback(() => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = null;
    if (typingActive.current && socketRef.current?.connected) socketRef.current.emit('chat:typing', { conversationId, isTyping: false });
    typingActive.current = false;
  }, [conversationId]);

  const handleDraftChange = useCallback((value: string) => {
    setDraft(value);
    if (!value.trim()) {
      stopTyping();
      return;
    }
    const now = Date.now();
    if (socketRef.current?.connected && (!typingActive.current || now - lastTypingSentAt.current >= 2_500)) {
      socketRef.current.emit('chat:typing', { conversationId, isTyping: true });
      typingActive.current = true;
      lastTypingSentAt.current = now;
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(stopTyping, 3_500);
  }, [conversationId, stopTyping]);

  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    let socket: Socket | null = null;
    setSocketState('connecting');
    setSocketError(null);

    const connect = async () => {
      const token = await readCredential('access');
      if (!active || !token) {
        if (active) setSocketState('disconnected');
        return;
      }
      socket = io(socketUrl, { autoConnect: false, auth: { token }, transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 1_000, reconnectionDelayMax: 10_000, timeout: 15_000 });
      socketRef.current = socket;
      socket.on('connect', () => {
        setSocketState('connected');
        setSocketError(null);
        setStaffTyping('');
        if (conversationStatusRef.current !== 'ARCHIVED' && conversationStatusRef.current !== 'CLOSED') socket?.emit('chat:join', { conversationId });
      });
      socket.on('disconnect', () => { setSocketState('disconnected'); setStaffTyping(''); if (staffTypingTimer.current) clearTimeout(staffTypingTimer.current); stopTyping(); });
      socket.on('connect_error', () => { setSocketState('disconnected'); setSocketError('Không thể kết nối realtime. Tin nhắn vẫn có thể tải lại qua máy chủ.'); });
      socket.on('chat:message', (payload: unknown) => {
        const message = parseSocketMessage(payload);
        if (!message || message.conversationId !== conversationId) return;
        const currentMessages = queryClient.getQueryData<SupportMessagePage>(messagesKey(conversationId))?.items ?? [];
        const alreadyPresent = currentMessages.some((item) => item.id === message.id || (!!message.clientMessageId && item.clientMessageId === message.clientMessageId));
        if (!alreadyPresent && message.senderId !== userId) AccessibilityInfo.announceForAccessibility(`${message.senderRole === 'PHARMACIST' || message.senderRole === 'ADMIN' ? message.senderRole === 'ADMIN' ? 'Quản trị viên' : 'Nhân viên' : 'Khách hàng'}: ${message.content}`);
        queryClient.setQueryData<SupportMessagePage>(messagesKey(conversationId), (current) => ({
          items: appendUniqueMessage(current?.items ?? [], message),
          nextCursor: current?.nextCursor ?? null,
        }));
      });
      socket.on('chat:joined', () => { void queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) }); });
      socket.on('chat:assigned', (payload: unknown) => {
        if (!payload || typeof payload !== 'object') return;
        const event = payload as { conversationId?: string; staffId?: string; staffName?: string; status?: string; message?: string };
        if (event.conversationId !== conversationId || typeof event.staffName !== 'string') return;
        const nextAssignmentKey = `${event.conversationId}:${event.staffId ?? event.staffName}`;
        if (assignmentKey.current === nextAssignmentKey) return;
        assignmentKey.current = nextAssignmentKey;
        const notice = typeof event.message === 'string' && event.message.trim() ? event.message : `Nhân viên ${event.staffName} đã tiếp nhận cuộc trò chuyện và sẽ hỗ trợ bạn.`;
        setAssignmentNotice(notice);
        conversationStatusRef.current = 'ASSIGNED';
        queryClient.setQueryData<SupportConversation>(['support-chat', 'conversation', userId], (current) => current ? { ...current, status: 'ASSIGNED', assignedStaffName: event.staffName, ...(typeof event.staffId === 'string' ? { assignedStaffId: event.staffId } : {}) } : current);
      });
      socket.on('chat:conversation_updated', (payload: unknown) => {
        if (!payload || typeof payload !== 'object') return;
        const update = payload as { id?: string; conversationId?: string; status?: SupportConversation['status']; assignedStaffName?: string | null };
        if ((update.id && update.id !== conversationId) || (update.conversationId && update.conversationId !== conversationId)) return;
        if (update.status) {
          conversationStatusRef.current = update.status;
          queryClient.setQueryData<SupportConversation>(['support-chat', 'conversation', userId], (current) => current ? { ...current, status: update.status! , ...(update.assignedStaffName !== undefined ? { assignedStaffName: update.assignedStaffName } : {}) } : current);
        }
      });
      socket.on('chat:closed', (payload: unknown) => {
        if (payload && typeof payload === 'object' && 'conversationId' in payload && payload.conversationId !== conversationId) return;
        conversationStatusRef.current = 'ARCHIVED';
        stopTyping();
        queryClient.setQueryData<SupportConversation>(['support-chat', 'conversation', userId], (current) => current ? { ...current, status: 'ARCHIVED' } : current);
      });
      socket.on('chat:typing', (payload: unknown) => {
        if (!payload || typeof payload !== 'object') return;
        const event = payload as { conversationId?: string; actorId?: string; actorName?: string; actorRole?: string; isTyping?: boolean };
        if (event.conversationId !== conversationId || event.actorId === userId || (event.actorRole !== 'PHARMACIST' && event.actorRole !== 'ADMIN')) return;
        if (staffTypingTimer.current) clearTimeout(staffTypingTimer.current);
        if (event.isTyping) {
          setStaffTyping(`${event.actorName || 'Nhân viên'} đang nhập…`);
          staffTypingTimer.current = setTimeout(() => setStaffTyping(''), 4_500);
        } else setStaffTyping('');
      });
      socket.on('chat:error', (payload: unknown) => {
        if (!payload || typeof payload !== 'object') return;
        const event = payload as { conversationId?: string; message?: string };
        if (event.conversationId && event.conversationId !== conversationId) return;
        setSocketError(typeof event.message === 'string' ? event.message : 'Không thể thực hiện thao tác trò chuyện.');
      });
      socket.connect();
    };

    void connect();
    return () => {
      active = false;
      stopTyping();
      if (staffTypingTimer.current) clearTimeout(staffTypingTimer.current);
      setStaffTyping('');
      socket?.emit('chat:leave', { conversationId });
      socket?.removeAllListeners();
      socket?.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [conversationId, credentialRevision, queryClient, socketUrl, stopTyping, userId]);

  const messages = messagePage?.items ?? [];
  const send = async () => {
    const content = draft.trim();
    if (!content || !conversationId || sending || isSupportConversationClosed(conversation.data?.status)) return;
    setSending(true);
    setSendError(null);
    stopTyping();
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
    {socketError ? <ThemedText accessibilityRole="alert" style={styles.socketError}>{socketError}</ThemedText> : null}

    {conversation.isLoading ? <View style={styles.centerState}><ActivityIndicator color={theme.tint} /><ThemedText themeColor="textSecondary" style={styles.stateText}>Đang mở cuộc trò chuyện…</ThemedText></View>
      : conversation.error ? <View style={styles.centerState}><ThemedText style={styles.gateTitle}>Chưa kết nối được chat</ThemedText><ThemedText themeColor="textSecondary" style={styles.stateText}>{conversation.error instanceof ApiError && conversation.error.statusCode === 404 ? 'Máy chủ chưa bật tính năng chat. Hãy cập nhật rồi thử lại.' : conversation.error instanceof ApiError ? conversation.error.message : 'Không tải được cuộc trò chuyện.'}</ThemedText><Pressable accessibilityRole="button" onPress={() => void conversation.refetch()} style={[styles.retryButton, { borderColor: theme.tint }]}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Thử lại</ThemedText></Pressable></View>
      : messagesQuery.isLoading ? <View style={styles.centerState}><ActivityIndicator color={theme.tint} /><ThemedText themeColor="textSecondary" style={styles.stateText}>Đang tải tin nhắn…</ThemedText></View>
        : messagesQuery.error ? <View style={styles.centerState}><ThemedText style={styles.gateTitle}>Không tải được tin nhắn</ThemedText><ThemedText themeColor="textSecondary" style={styles.stateText}>{messagesQuery.error instanceof ApiError ? messagesQuery.error.message : 'Hãy thử tải lại cuộc trò chuyện.'}</ThemedText><Pressable accessibilityRole="button" onPress={() => void messagesQuery.refetch()} style={[styles.retryButton, { borderColor: theme.tint }]}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Tải lại</ThemedText></Pressable></View>
          : <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messageList}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={<>{assignmentNotice ? <ThemedText accessibilityRole="summary" accessibilityLiveRegion="polite" style={[styles.assignmentNotice, { backgroundColor: theme.backgroundElement, color: theme.text }]}>{assignmentNotice}</ThemedText> : null}{conversation.data?.assignedStaffName ? <ThemedText themeColor="textSecondary" style={styles.assignedStaff}>Nhân viên {conversation.data.assignedStaffName} đang hỗ trợ bạn</ThemedText> : null}</>}
            ListEmptyComponent={<View style={styles.emptyMessages}><ThemedText style={styles.gateTitle}>Bắt đầu trò chuyện</ThemedText><ThemedText themeColor="textSecondary" style={styles.stateText}>Gửi tin nhắn để được cửa hàng hỗ trợ.</ThemedText></View>}
            renderItem={({ item }) => {
              const mine = item.senderId === userId;
              return <View style={[styles.messageRow, mine ? styles.mineRow : styles.theirsRow]}><View style={[styles.messageBubble, mine ? { backgroundColor: theme.tint } : { backgroundColor: theme.backgroundElement }]}><ThemedText style={[styles.messageText, mine ? styles.mineText : { color: theme.text }]}>{item.content}</ThemedText><ThemedText style={[styles.messageTime, mine ? styles.mineTime : { color: theme.textSecondary }]}>{formatMessageTime(item.createdAt)}</ThemedText></View></View>;
            }}
            ListFooterComponent={staffTyping ? <ThemedText accessibilityLiveRegion="polite" themeColor="textSecondary" style={styles.typingLabel}>{staffTyping}</ThemedText> : <View style={{ height: 4 }} />}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />}

    {isSupportConversationClosed(conversation.data?.status) ? <View style={[styles.closedNotice, { backgroundColor: theme.backgroundElement }]}><ThemedText themeColor="textSecondary">Cuộc trò chuyện đã kết thúc.</ThemedText></View> : null}
    {sendError ? <ThemedText accessibilityRole="alert" style={styles.sendError}>{sendError}</ThemedText> : null}
    {!isSupportConversationClosed(conversation.data?.status) && conversation.data ? <View style={[styles.composer, { borderTopColor: theme.backgroundElement }]}><TextInput value={draft} onChangeText={handleDraftChange} onBlur={stopTyping} placeholder="Nhập tin nhắn…" placeholderTextColor={theme.textSecondary} multiline maxLength={2000} accessibilityLabel="Nội dung tin nhắn" style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]} /><Pressable accessibilityRole="button" accessibilityLabel="Gửi tin nhắn" disabled={!draft.trim() || sending} onPress={() => void send()} style={[styles.sendButton, { backgroundColor: theme.tint, opacity: !draft.trim() || sending ? 0.55 : 1 }]}>{sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <SymbolView name={{ ios: 'arrow.up', android: 'send', web: 'send' }} size={18} tintColor="#FFFFFF" />}</Pressable></View> : null}
  </View>;
}

function appendUniqueMessage(items: SupportMessage[], message: SupportMessage) {
  const index = items.findIndex((item) => item.id === message.id || (!!message.clientMessageId && item.clientMessageId === message.clientMessageId));
  if (index >= 0) return items.map((item, itemIndex) => itemIndex === index ? message : item);
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

function isSupportConversationClosed(status: SupportConversation['status'] | undefined) {
  return status === 'CLOSED' || status === 'ARCHIVED';
}

const styles = StyleSheet.create({
  floatingLayer: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', alignItems: 'flex-end', paddingRight: 17, paddingBottom: 92, zIndex: 50 },
  webFloatingLayer: { top: undefined, left: undefined, width: 56, height: 56, right: 17, bottom: 92, paddingRight: 0, paddingBottom: 0 },
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
  socketError: { color: '#B42318', fontSize: 11, textAlign: 'center', paddingHorizontal: 14, paddingBottom: 5 },
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
  assignmentNotice: { marginHorizontal: 14, marginVertical: 8, padding: 12, borderRadius: 12, fontSize: 12, lineHeight: 18, overflow: 'hidden' },
  assignedStaff: { textAlign: 'center', fontSize: 11, paddingBottom: 8 },
  typingLabel: { paddingHorizontal: 16, paddingVertical: 7, fontSize: 11 },
  mineTime: { color: 'rgba(255,255,255,0.75)' },
  closedNotice: { alignItems: 'center', padding: 10 },
  sendError: { color: '#B42318', fontSize: 12, paddingHorizontal: 14, paddingTop: 6 },
  composer: { minHeight: 64, flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 9, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, maxHeight: 100, minHeight: 42, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 18, fontSize: 14 },
  sendButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});

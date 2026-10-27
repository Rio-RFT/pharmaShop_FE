import { AppHeader } from '@/components/app-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import * as AdminApi from '@/features/admin/api/admin';
import { useAuth } from '@/features/auth/auth-provider';
import { onCredentialsChanged, readCredential } from '@/features/auth/token-storage';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, API_BASE_URL } from '@/shared/api/client';
import { LoadingIndicator } from '@/shared/components/loading-indicator';
import { usePullToRefresh } from '@/shared/hooks/use-pull-to-refresh';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { io, type Socket } from 'socket.io-client';

export default function AdminChatConversationScreen() {
  const { id, customerName: customerParam, status: statusParam, assignedStaffName: staffParam } = useLocalSearchParams<{ id: string; customerName?: string; status?: AdminApi.ChatStatus; assignedStaffName?: string }>();
  const theme = useTheme(); const router = useRouter(); const queryClient = useQueryClient(); const insets = useSafeAreaInsets();
  const { user } = useAuth(); const listRef = useRef<FlatList<AdminApi.AdminChatMessage>>(null);
  const [message, setMessage] = useState(''); const [typingLabel, setTypingLabel] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null); const socketRef = useRef<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false); const [socketError, setSocketError] = useState('');
  const [credentialRevision, setCredentialRevision] = useState(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null); const typingIndicatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null); const lastTypingSentAt = useRef(0); const typingActive = useRef(false);
  const [conversationStatus, setConversationStatus] = useState<AdminApi.ChatStatus>(statusParam ?? 'WAITING_FOR_STAFF');
  const conversationStatusRef = useRef(conversationStatus); conversationStatusRef.current = conversationStatus;
  const [staffName, setStaffName] = useState(staffParam ?? '');
  const customerName = customerParam?.trim() || 'Khách hàng';
  const colors = useMemo(() => ({ accent: theme.tint, background: theme.background, surface: theme.backgroundElement, muted: theme.backgroundSelected, text: theme.text, secondary: theme.textSecondary }), [theme]);
  const messages = useQuery({ queryKey: ['admin-chat-messages', id], queryFn: () => AdminApi.getChatMessages(id), enabled: user?.role === 'ADMIN' && !!id, refetchInterval: 15_000 });
  const pullRefresh = usePullToRefresh();

  useEffect(() => onCredentialsChanged(() => setCredentialRevision((revision) => revision + 1)), []);

  const stopTyping = useCallback(() => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = null;
    if (typingActive.current && socketRef.current?.connected) socketRef.current.emit('chat:typing', { conversationId: id, isTyping: false });
    typingActive.current = false;
  }, [id]);

  const handleMessageChange = useCallback((value: string) => {
    setMessage(value);
    if (!value.trim()) { stopTyping(); return; }
    const now = Date.now();
    if (socketRef.current?.connected && (!typingActive.current || now - lastTypingSentAt.current >= 2_500)) {
      socketRef.current.emit('chat:typing', { conversationId: id, isTyping: true });
      typingActive.current = true;
      lastTypingSentAt.current = now;
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(stopTyping, 3_500);
  }, [id, stopTyping]);

  useEffect(() => { let active = true; let client: Socket | undefined;
    void readCredential('access').then((token) => {
      if (!active || !token) return;
      client = io(API_BASE_URL.replace(/\/api\/v1\/?$/, ''), { auth: { token }, transports: ['websocket', 'polling'], reconnection: true });
      socketRef.current = client;
      client.on('connect', () => {
        setSocketConnected(true); setSocketError(''); setTypingLabel('');
        client?.emit('join_pharmacist_room');
        if (conversationStatusRef.current !== 'ARCHIVED') client?.emit('chat:join', { conversationId: id });
      });
      client.on('disconnect', () => { setSocketConnected(false); setTypingLabel(''); if (typingIndicatorTimer.current) clearTimeout(typingIndicatorTimer.current); stopTyping(); });
      client.on('connect_error', () => { setSocketConnected(false); setSocketError('Không thể kết nối realtime. Đang thử kết nối lại…'); });
      client.on('chat:message', (event: unknown) => {
        const messageEvent = event && typeof event === 'object' && 'data' in event && event.data && typeof event.data === 'object' ? event.data : event;
        if (event && typeof event === 'object' && 'data' in event && event.data && typeof event.data === 'object' && 'conversationId' in event.data && event.data.conversationId !== id) return;
        if (event && typeof event === 'object' && 'conversationId' in event && event.conversationId !== id) return;
        if (messageEvent && typeof messageEvent === 'object' && 'senderRole' in messageEvent && messageEvent.senderRole === 'CUSTOMER' && 'content' in messageEvent && typeof messageEvent.content === 'string') AccessibilityInfo.announceForAccessibility(`New customer message: ${messageEvent.content}`);
        void queryClient.invalidateQueries({ queryKey: ['admin-chat-messages', id] });
        void queryClient.invalidateQueries({ queryKey: ['admin-chat'] });
      });
      client.on('chat:joined', (event: unknown) => {
        if (event && typeof event === 'object' && 'conversationId' in event && event.conversationId !== id) return;
        void queryClient.invalidateQueries({ queryKey: ['admin-chat-messages', id] });
      });
      client.on('chat:conversation_updated', (event: unknown) => {
        if (event && typeof event === 'object') {
          const update = event as { id?: string; conversationId?: string; status?: AdminApi.ChatStatus; assignedStaffName?: string | null };
          if ((!update.id || update.id === id) && (!update.conversationId || update.conversationId === id)) {
            if (update.status) { conversationStatusRef.current = update.status; setConversationStatus(update.status); }
            if (update.assignedStaffName !== undefined) setStaffName(update.assignedStaffName ?? '');
          }
        }
        void queryClient.invalidateQueries({ queryKey: ['admin-chat'] });
      });
      client.on('chat:assigned', (event: unknown) => {
        if (!event || typeof event !== 'object') return;
        const assignment = event as { conversationId?: string; staffName?: string; status?: AdminApi.ChatStatus };
        if (assignment.conversationId !== id) return;
        if (assignment.status) { conversationStatusRef.current = assignment.status; setConversationStatus(assignment.status); }
        if (assignment.staffName) setStaffName(assignment.staffName);
      });
      client.on('chat:typing', (event: unknown) => {
        if (!event || typeof event !== 'object') return;
        const typing = event as { actorId?: string; actorRole?: string; actorName?: string; isTyping?: boolean; conversationId?: string };
        if (typing.conversationId !== id || typing.actorRole !== 'CUSTOMER' || typing.actorId === user?.id) return;
        if (typingIndicatorTimer.current) clearTimeout(typingIndicatorTimer.current);
        if (typing.isTyping) {
          setTypingLabel(`${typing.actorName ?? customerName} đang nhập…`);
          typingIndicatorTimer.current = setTimeout(() => setTypingLabel(''), 4_500);
        } else setTypingLabel('');
      });
      client.on('chat:error', (event: unknown) => {
        if (!event || typeof event !== 'object') return;
        const chatError = event as { conversationId?: string; message?: string };
        if (chatError.conversationId && chatError.conversationId !== id) return;
        setSocketError(typeof chatError.message === 'string' ? chatError.message : 'Không thể thực hiện thao tác trò chuyện.');
      });
      client.on('chat:closed', () => { conversationStatusRef.current = 'ARCHIVED'; setConversationStatus('ARCHIVED'); stopTyping(); });
      if (active) { setSocket(client); }
    }).catch(() => undefined);
    return () => { active = false; stopTyping(); if (typingIndicatorTimer.current) clearTimeout(typingIndicatorTimer.current); setTypingLabel(''); client?.emit('chat:leave', { conversationId: id }); client?.removeAllListeners(); client?.disconnect(); if (socketRef.current === client) socketRef.current = null; };
  }, [customerName, id, queryClient, credentialRevision, stopTyping, user?.id]);

  const onActionSuccess = useCallback(async (nextStatus?: AdminApi.ChatStatus, nextStaff?: string | null) => {
    if (nextStatus) { conversationStatusRef.current = nextStatus; setConversationStatus(nextStatus); }
    if (nextStaff !== undefined) setStaffName(nextStaff ?? '');
    if (nextStatus && nextStatus !== 'ARCHIVED') socketRef.current?.emit('chat:join', { conversationId: id });
    if (nextStatus === 'ARCHIVED') { stopTyping(); socketRef.current?.emit('chat:leave', { conversationId: id }); }
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['admin-chat'] }), queryClient.invalidateQueries({ queryKey: ['admin-chat-messages', id] })]);
  }, [id, queryClient, stopTyping]);
  const accept = useMutation({ mutationFn: () => AdminApi.acceptChat(id), onSuccess: (conversation) => { void onActionSuccess(conversation.status, conversation.assignedStaffName); } });
  const send = useMutation({ mutationFn: () => AdminApi.sendChatMessage(id, { content: message.trim(), clientMessageId: `${Date.now()}-${Math.random().toString(36).slice(2)}` }), onSuccess: () => { setMessage(''); void queryClient.invalidateQueries({ queryKey: ['admin-chat-messages', id] }); } });
  const close = useMutation({ mutationFn: () => AdminApi.closeChat(id), onSuccess: (conversation) => { void onActionSuccess(conversation.status, conversation.assignedStaffName); } });
  const archive = useMutation({ mutationFn: () => AdminApi.archiveChat(id), onSuccess: (conversation) => { void onActionSuccess(conversation.status, conversation.assignedStaffName); } });
  const reopen = useMutation({ mutationFn: () => AdminApi.reopenChat(id), onSuccess: (conversation) => { void onActionSuccess(conversation.status, conversation.assignedStaffName); } });
  const allMessages = messages.data?.items ?? [];
  const sendMessage = () => { if (!message.trim() || send.isPending) return; stopTyping(); send.mutate(); };
  const confirmAction = (title: string, description: string, action: () => void) => Alert.alert(title, description, [{ text: 'Để sau', style: 'cancel' }, { text: 'Xác nhận', onPress: action }]);

  if (user?.role !== 'ADMIN') return <ThemedView style={[styles.center, { backgroundColor: colors.background }]}><ThemedText>Chỉ tài khoản ADMIN mới truy cập được.</ThemedText><Pressable onPress={() => router.replace('/admin?section=chat' as import('expo-router').Href)}><ThemedText style={{ color: colors.accent, marginTop: 12 }}>Quay lại hộp thư</ThemedText></Pressable></ThemedView>;

  return <ThemedView style={[styles.page, { backgroundColor: colors.background }]}>
    <SafeAreaView edges={['top']} style={styles.safe}><AppHeader />
      <View style={[styles.topBar, { borderBottomColor: colors.muted }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Quay lại danh sách tin nhắn" onPress={() => router.back()} hitSlop={8} style={[styles.iconButton, { backgroundColor: colors.surface }]}><SymbolView name={{ ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' }} size={21} tintColor={colors.text} /></Pressable>
        <View style={styles.personMark}><ThemedText style={{ color: colors.accent, fontWeight: '800' }}>{initials(customerName)}</ThemedText></View>
        <View style={styles.personCopy}><ThemedText numberOfLines={1} style={styles.personName}>{customerName}</ThemedText><ThemedText numberOfLines={1} themeColor="textSecondary" style={styles.personStatus}>{staffName ? `${staffName} đang tiếp nhận` : statusLabel(conversationStatus)}</ThemedText></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Tùy chọn hội thoại" onPress={() => Alert.alert('Trạng thái hội thoại', `${statusLabel(conversationStatus)}${staffName ? ` · ${staffName}` : ''}`)} hitSlop={8} style={styles.headerAction}><SymbolView name={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }} size={22} tintColor={colors.secondary} /></Pressable>
      </View>
      <View style={styles.statusLine}><View style={[styles.statusDot, { backgroundColor: socketConnected ? colors.accent : colors.secondary }]} /><ThemedText themeColor="textSecondary" style={styles.statusText}>{socketConnected ? 'Realtime đã kết nối' : 'Đang kết nối realtime'} · {statusLabel(conversationStatus)}{staffName ? ` · ${staffName}` : ''}</ThemedText><ThemedText themeColor="textSecondary" style={styles.expiry}>Tự đóng sau 24 giờ không hoạt động</ThemedText></View>
      {socketError ? <ThemedText accessibilityRole="alert" style={styles.socketError}>{socketError}</ThemedText> : null}

      <KeyboardAvoidingView style={styles.chatBody} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        {messages.isPending ? <View style={styles.center}><LoadingIndicator size={42} color={colors.accent} /></View> : messages.error ? <View style={styles.center}><ThemedText accessibilityRole="alert" style={{ color: '#B42318', textAlign: 'center' }}>{messages.error instanceof ApiError ? messages.error.message : 'Không tải được tin nhắn.'}</ThemedText><Pressable onPress={() => void messages.refetch()}><ThemedText style={{ color: colors.accent, marginTop: 10 }}>Thử lại</ThemedText></Pressable></View> : <FlatList
          ref={listRef} data={allMessages} keyExtractor={(item) => item.id} contentContainerStyle={styles.messageList} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          refreshControl={<RefreshControl refreshing={pullRefresh.refreshing} onRefresh={() => void pullRefresh.onRefresh()} tintColor={colors.accent} colors={[colors.accent]} />}
          ListHeaderComponent={<View style={styles.threadIntro}><ThemedText style={styles.threadIntroTitle}>Cuộc trò chuyện với {customerName}</ThemedText><ThemedText themeColor="textSecondary" style={styles.threadIntroBody}>Tin nhắn được đồng bộ theo thời gian thực. Hội thoại tự lưu trữ sau 24 giờ không có phản hồi.</ThemedText></View>}
          ListEmptyComponent={<View style={styles.emptyMessages}><ThemedText themeColor="textSecondary">Chưa có tin nhắn. Hãy gửi lời chào để bắt đầu.</ThemedText></View>}
          renderItem={({ item }) => <ChatBubble item={item} colors={colors} />}
          ListFooterComponent={typingLabel ? <ThemedText accessibilityLiveRegion="polite" themeColor="textSecondary" style={styles.typingLabel}>{typingLabel}</ThemedText> : <View style={{ height: 8 }} />}
        />}

        <View style={[styles.actionStrip, { borderTopColor: colors.muted }]}>
          {conversationStatus === 'WAITING_FOR_STAFF' ? <ActionButton label={accept.isPending ? 'Đang nhận…' : 'Nhận xử lý'} icon={<SymbolView name={{ ios: 'checkmark.circle', android: 'check_circle', web: 'check_circle' }} size={16} tintColor="#fff" />} onPress={() => accept.mutate()} primary={colors.accent} disabled={accept.isPending} /> : null}
          {conversationStatus === 'CLOSURE_PENDING' || conversationStatus === 'ARCHIVED' ? <ActionButton label={reopen.isPending ? 'Đang mở…' : 'Mở lại'} icon={<SymbolView name={{ ios: 'arrow.uturn.backward', android: 'restore', web: 'restore' }} size={16} tintColor={colors.accent} />} onPress={() => reopen.mutate()} disabled={reopen.isPending} /> : <>
            <ActionButton label="Đề nghị kết thúc" icon={<SymbolView name={{ ios: 'xmark.circle', android: 'cancel', web: 'cancel' }} size={16} tintColor={colors.secondary} />} onPress={() => confirmAction('Đề nghị kết thúc hội thoại?', 'Khách hàng sẽ thấy yêu cầu kết thúc cuộc trò chuyện.', () => close.mutate())} disabled={close.isPending} />
            <ActionButton label="Lưu trữ" icon={<SymbolView name={{ ios: 'archivebox', android: 'archive', web: 'archive' }} size={16} tintColor={colors.secondary} />} onPress={() => confirmAction('Lưu trữ hội thoại?', 'Bạn có thể mở lại hội thoại đã lưu trữ.', () => archive.mutate())} disabled={archive.isPending} />
          </>}
        </View>
        {accept.error || close.error || archive.error || reopen.error || send.error ? <ThemedText accessibilityRole="alert" style={styles.actionError}>{mutationMessage(accept.error ?? close.error ?? archive.error ?? reopen.error ?? send.error)}</ThemedText> : null}
        {conversationStatus !== 'ARCHIVED' ? <View style={[styles.composer, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 8) }]}>
          <TextInput value={message} onChangeText={handleMessageChange} onBlur={stopTyping} onSubmitEditing={sendMessage} multiline maxLength={2000} placeholder="Nhắn tin…" placeholderTextColor={colors.secondary} style={[styles.composerInput, { backgroundColor: colors.surface, color: colors.text }]} />
          <Pressable accessibilityRole="button" accessibilityLabel="Gửi tin nhắn" disabled={!message.trim() || send.isPending} onPress={sendMessage} style={[styles.sendButton, { backgroundColor: colors.accent, opacity: !message.trim() || send.isPending ? 0.5 : 1 }]}>{send.isPending ? <LoadingIndicator size={20} color="#fff" /> : <SymbolView name={{ ios: 'paperplane.fill', android: 'send', web: 'send' }} size={18} tintColor="#fff" />}</Pressable>
        </View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  </ThemedView>;
}

function ChatBubble({ item, colors }: { item: AdminApi.AdminChatMessage; colors: { accent: string; surface: string; muted: string; text: string } }) {
  if (item.type === 'SYSTEM') return <View style={styles.systemMessage}><ThemedText themeColor="textSecondary" style={styles.systemText}>{item.content}</ThemedText></View>;
  const mine = item.senderRole === 'ADMIN' || item.senderRole === 'PHARMACIST';
  const bubbleColor = mine ? colors.accent : colors.surface;
  const textColor = mine ? '#FFFFFF' : colors.text;
  const attachmentUrl = item.attachment?.['url'];
  const productName = item.product?.['name'];
  return <View style={[styles.messageRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
    <View style={[styles.bubble, { backgroundColor: bubbleColor, borderBottomRightRadius: mine ? 5 : 18, borderBottomLeftRadius: mine ? 18 : 5 }]}>
      {typeof attachmentUrl === 'string' ? <Image source={{ uri: attachmentUrl }} contentFit="cover" accessibilityLabel="Ảnh đính kèm" style={styles.attachment} /> : null}
      {typeof productName === 'string' ? <View style={[styles.productCard, { backgroundColor: mine ? 'rgba(255,255,255,0.14)' : colors.muted }]}>{typeof item.product?.['imageUrl'] === 'string' ? <Image source={{ uri: item.product['imageUrl'] }} contentFit="contain" accessibilityLabel={productName} style={styles.productImage} /> : null}<View style={{ flex: 1 }}><ThemedText numberOfLines={2} style={{ color: textColor, fontWeight: '700' }}>{productName}</ThemedText>{item.product?.['price'] != null ? <ThemedText style={{ color: mine ? '#E5FFF5' : colors.text, fontSize: 12, marginTop: 3 }}>{Number(item.product['price']).toLocaleString('vi-VN')} ₫</ThemedText> : null}</View></View> : null}
      {item.type === 'TEXT' || (item.type !== 'IMAGE' && item.type !== 'PRODUCT') ? <ThemedText style={[styles.messageText, { color: textColor }]}>{item.content}</ThemedText> : null}
      <View style={styles.messageMeta}>{item.senderName && !mine ? <ThemedText numberOfLines={1} style={[styles.senderName, { color: mine ? '#E5FFF5' : colors.text }]}>{item.senderName}</ThemedText> : null}<ThemedText style={[styles.messageTime, { color: mine ? '#D7F5E9' : '#75827C' }]}>{new Date(item.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</ThemedText></View>
    </View>
  </View>;
}

function ActionButton({ label, icon, onPress, primary, disabled }: { label: string; icon: React.ReactNode; onPress: () => void; primary?: string; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.actionButton, primary ? { backgroundColor: primary } : null, { opacity: disabled ? 0.55 : 1 }]}>{icon}<ThemedText style={[styles.actionButtonText, primary ? { color: '#fff' } : null]}>{label}</ThemedText></Pressable>;
}

function statusLabel(status: AdminApi.ChatStatus) {
  return ({ WAITING_FOR_STAFF: 'Đang chờ nhân viên', ASSIGNED: 'Đang xử lý', CLOSURE_PENDING: 'Chờ xác nhận kết thúc', ARCHIVED: 'Đã lưu trữ' })[status];
}
function initials(name: string) { return name.trim().split(/\s+/).slice(-2).map((part) => part[0]?.toLocaleUpperCase('vi') ?? '').join('') || 'KH'; }
function mutationMessage(error: unknown) { return error instanceof ApiError ? error.message : 'Thao tác chưa hoàn tất. Vui lòng thử lại.'; }

const styles = StyleSheet.create({
  page: { flex: 1 }, safe: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  topBar: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth }, iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  personMark: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E5F4ED', alignItems: 'center', justifyContent: 'center' }, personCopy: { flex: 1 }, personName: { fontSize: 16, fontWeight: '800' }, personStatus: { fontSize: 11, marginTop: 2 }, headerAction: { width: 40, height: 42, alignItems: 'center', justifyContent: 'center' },
  statusLine: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16 }, statusDot: { width: 7, height: 7, borderRadius: 4 }, statusText: { fontSize: 11, fontWeight: '600' }, expiry: { flex: 1, textAlign: 'right', fontSize: 10 }, chatBody: { flex: 1 },
  socketError: { color: '#B42318', fontSize: 11, textAlign: 'center', paddingHorizontal: 14, paddingBottom: 5 },
  messageList: { flexGrow: 1, paddingHorizontal: 14, paddingVertical: 12 }, threadIntro: { alignItems: 'center', paddingHorizontal: 22, paddingVertical: 20, marginBottom: 12 }, threadIntroTitle: { fontSize: 14, fontWeight: '700', textAlign: 'center' }, threadIntroBody: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 5 }, emptyMessages: { minHeight: 100, alignItems: 'center', justifyContent: 'center' },
  messageRow: { flexDirection: 'row', marginVertical: 4 }, bubble: { maxWidth: '84%', paddingHorizontal: 12, paddingTop: 9, paddingBottom: 6, borderRadius: 18 }, messageText: { fontSize: 14, lineHeight: 20 }, messageMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 7, marginTop: 4 }, senderName: { flex: 1, fontSize: 10, fontWeight: '600' }, messageTime: { fontSize: 9 }, attachment: { width: 220, height: 190, borderRadius: 12, marginBottom: 5 }, productCard: { minWidth: 210, maxWidth: 250, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 8, borderRadius: 12 }, productImage: { width: 50, height: 50, borderRadius: 8, backgroundColor: '#fff' }, systemMessage: { alignItems: 'center', paddingVertical: 7 }, systemText: { fontSize: 11, textAlign: 'center' }, typingLabel: { paddingHorizontal: 18, paddingBottom: 8, fontSize: 11 },
  actionStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth }, actionButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 18, backgroundColor: '#F0F4F2' }, actionButtonText: { fontSize: 11, color: '#34433D', fontWeight: '700' }, actionError: { color: '#B42318', paddingHorizontal: 16, fontSize: 12 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8 }, composerInput: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 10, fontSize: 14 }, sendButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});

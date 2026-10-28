import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/features/auth/auth-provider';
import { broadcastNotification, getNotifications, type BroadcastInput, type BroadcastResult, type NotificationBlock, type NotificationCategory } from '@/features/notifications/api/notifications';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/shared/api/client';
import { Image } from 'expo-image';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePullToRefresh } from '@/shared/hooks/use-pull-to-refresh';

type BlockType = NotificationBlock['type'];
const newBlock = (type: BlockType): NotificationBlock => {
  if (type === 'HEADING' || type === 'TEXT') return { type, text: '' };
  if (type === 'IMAGE') return { type, url: '', altText: '' };
  if (type === 'BUTTON') return { type, label: '', url: '' };
  return { type: 'DIVIDER' };
};

export default function AdminBroadcastScreen() {
  const theme = useTheme(); const router = useRouter(); const { user, loading } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [type, setType] = useState<'SHORT' | 'PAGE'>('SHORT'); const [category, setCategory] = useState<NotificationCategory>('SYSTEM'); const [title, setTitle] = useState(''); const [body, setBody] = useState('');
  const [blocks, setBlocks] = useState<NotificationBlock[]>([]); const [validationError, setValidationError] = useState(''); const [result, setResult] = useState<BroadcastResult | null>(null); const [view, setView] = useState<'history' | 'compose'>('history');
  const queryClient = useQueryClient();
  const history = useInfiniteQuery({ queryKey: ['notifications', 'admin-history'], queryFn: ({ pageParam }) => getNotifications(pageParam), initialPageParam: 1, getNextPageParam: (last) => last.hasMore ? last.page + 1 : undefined, enabled: isAdmin });
  const pullRefresh = usePullToRefresh();
  const broadcast = useMutation({ mutationFn: (input: BroadcastInput) => broadcastNotification(input), onSuccess: (data) => { setResult(data); setTitle(''); setBody(''); setBlocks([]); setType('SHORT'); setCategory('SYSTEM'); setView('history'); void queryClient.invalidateQueries({ queryKey: ['notifications'] }); } });

  const setBlock = (index: number, block: NotificationBlock) => setBlocks((current) => current.map((item, itemIndex) => itemIndex === index ? block : item));
  const validate = (): string | null => {
    if (!title.trim() || title.trim().length > 80) return 'Tiêu đề bắt buộc, tối đa 80 ký tự.';
    if (!body.trim() || body.trim().length > 180) return 'Nội dung preview bắt buộc, tối đa 180 ký tự.';
    if (type === 'SHORT') return null;
    if (blocks.length < 1 || blocks.length > 20) return 'Trang sự kiện cần từ 1 đến 20 block.';
    for (const [index, block] of blocks.entries()) {
      const label = `Block ${index + 1}`;
      if (block.type === 'HEADING' && (!block.text.trim() || block.text.length > 1600)) return `${label}: tiêu đề cần nhập, tối đa 1600 ký tự.`;
      if (block.type === 'TEXT' && (!block.text.trim() || block.text.length > 1600)) return `${label}: nội dung cần nhập, tối đa 1600 ký tự.`;
      if (block.type === 'IMAGE' && (!isHttpsUrl(block.url) || (block.altText?.length ?? 0) > 200)) return `${label}: ảnh cần URL HTTPS hợp lệ, alt text tối đa 200 ký tự.`;
      if (block.type === 'BUTTON' && (!block.label.trim() || block.label.length > 80 || !isActionUrl(block.url))) return `${label}: nút cần nhãn tối đa 80 ký tự và URL HTTPS hoặc pharmashop:// hợp lệ.`;
    }
    return null;
  };
  const submit = () => {
    const error = validate(); setValidationError(error ?? ''); if (error) return;
    Alert.alert('Gửi thông báo toàn hệ thống?', `Thông báo sẽ xuất hiện trong inbox của người dùng hoạt động và gửi push đến thiết bị đã đăng ký.\n\n${title.trim()}\n${body.trim()}`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Gửi thông báo', onPress: () => { setResult(null); broadcast.mutate({ type, category, title: title.trim(), body: body.trim(), ...(type === 'PAGE' ? { content: blocks } : {}) }); } },
    ]);
  };
  const input = (label: string, value: string, onChange: (value: string) => void, options: { maxLength: number; multiline?: boolean; hint?: string }) => <View style={styles.field}><View style={styles.fieldHeader}><ThemedText style={styles.label}>{label}</ThemedText><ThemedText themeColor="textSecondary" style={styles.counter}>{value.length}/{options.maxLength}</ThemedText></View><TextInput value={value} onChangeText={onChange} maxLength={options.maxLength} multiline={options.multiline} placeholder={label} placeholderTextColor={theme.textSecondary} accessibilityLabel={label} style={[styles.input, options.multiline && styles.textArea, { color: theme.text, borderColor: theme.backgroundSelected }]} />{options.hint ? <ThemedText themeColor="textSecondary" style={styles.hint}>{options.hint}</ThemedText> : null}</View>;
  const button = (label: string, action: () => void, disabled = false, secondary = false) => <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={action} style={[styles.button, { backgroundColor: secondary ? theme.backgroundElement : theme.tint, opacity: disabled ? 0.5 : 1 }]}><ThemedText style={{ color: secondary ? theme.text : '#fff', fontWeight: '700' }}>{label}</ThemedText></Pressable>;

  if (loading) return <ThemedView style={styles.center}><ThemedText>Đang kiểm tra quyền truy cập...</ThemedText></ThemedView>;
  if (!isAdmin) return <ThemedView style={styles.center}><ThemedText style={styles.heading}>Chỉ tài khoản ADMIN mới được gửi thông báo.</ThemedText><Pressable onPress={() => router.back()}><ThemedText style={{ color: theme.tint }}>Quay lại</ThemedText></Pressable></ThemedView>;

  return <ThemedView style={styles.page}><SafeAreaView style={styles.safe} edges={['top']}><ScrollView alwaysBounceVertical stickyHeaderIndices={[3]} refreshControl={<RefreshControl refreshing={pullRefresh.refreshing} onRefresh={() => void pullRefresh.onRefresh()} tintColor={theme.tint} colors={[theme.tint]} />} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>‹ Quản trị</ThemedText></Pressable>
    <ThemedText style={styles.heading}>Thông báo toàn hệ thống</ThemedText><ThemedText themeColor="textSecondary" style={styles.description}>Gửi nội dung tới inbox người dùng đang hoạt động; push được gửi đến thiết bị đã đăng ký.</ThemedText>
    <View style={[styles.modeTabs, { backgroundColor: theme.background, flexDirection: 'row', alignSelf: 'stretch' }]}>{(['history', 'compose'] as const).map((value) => <Pressable key={value} onPress={() => setView(value)} style={[styles.modeTab, { flex: 1, minWidth: 0, backgroundColor: view === value ? theme.tint : theme.backgroundElement }]}><ThemedText numberOfLines={1} adjustsFontSizeToFit style={{ color: view === value ? '#fff' : theme.text, fontWeight: '700', textAlign: 'center' }}>{value === 'history' ? 'Lịch sử' : 'Soạn thông báo'}</ThemedText></Pressable>)}</View>
    {view === 'history' ? <View style={styles.history}>
      <View style={styles.historyHeading}><ThemedText style={styles.sectionTitle}>Thông báo trong inbox admin</ThemedText><Pressable onPress={() => void history.refetch()}><ThemedText style={{ color: theme.tint }}>Làm mới</ThemedText></Pressable></View>
      {result ? <View style={[styles.result, { backgroundColor: theme.backgroundElement }]}><ThemedText style={styles.label}>Đã tạo thông báo</ThemedText><ThemedText themeColor="textSecondary" style={styles.hint}>{result.recipientCount} người nhận inbox · {result.deviceCount} thiết bị được gửi yêu cầu push</ThemedText></View> : null}
      {history.isLoading ? <ThemedText themeColor="textSecondary">Đang tải lịch sử...</ThemedText> : history.error ? <ThemedText accessibilityRole="alert" style={styles.error}>{history.error instanceof ApiError ? history.error.message : 'Không tải được lịch sử gửi.'}</ThemedText> : null}
      {history.data?.pages.flatMap((page) => page.items).map((item) => <Pressable key={item.id} onPress={() => router.push(`/notifications/${item.notification.id}` as import('expo-router').Href)} style={[styles.historyItem, { borderBottomColor: theme.backgroundSelected }]}><View style={styles.historyTitleRow}><ThemedText style={styles.label}>{item.notification.title}</ThemedText><ThemedText style={{ color: theme.tint, fontSize: 10, fontWeight: '800' }}>{item.notification.type}</ThemedText></View><ThemedText themeColor="textSecondary" numberOfLines={2} style={styles.hint}>{item.notification.body}</ThemedText><ThemedText themeColor="textSecondary" style={styles.hint}>{new Date(item.notification.createdAt).toLocaleString('vi-VN')}</ThemedText></Pressable>)}
      {history.data?.pages[0]?.items.length === 0 ? <ThemedText themeColor="textSecondary" style={styles.empty}>Chưa có thông báo nào trong inbox admin.</ThemedText> : null}
      {history.hasNextPage ? <Pressable disabled={history.isFetchingNextPage} onPress={() => void history.fetchNextPage()} style={styles.loadMore}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>{history.isFetchingNextPage ? 'Đang tải...' : 'Tải thêm'}</ThemedText></Pressable> : null}
    </View> : <>
    <ThemedText style={styles.sectionTitle}>Phân loại thông báo</ThemedText><View style={styles.typePicker}>{(['SYSTEM', 'EVENT'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: category === value }} onPress={() => { setCategory(value); setValidationError(''); }} style={[styles.typeOption, { borderColor: category === value ? theme.tint : theme.backgroundSelected, backgroundColor: category === value ? theme.backgroundSelected : 'transparent' }]}><ThemedText style={{ color: theme.text, fontWeight: '700' }}>{value === 'SYSTEM' ? 'Thông báo hệ thống' : 'Sự kiện'}</ThemedText><ThemedText themeColor="textSecondary" style={styles.hint}>{value === 'SYSTEM' ? 'Đơn hàng, tài khoản, dịch vụ' : 'Chương trình, ưu đãi, sự kiện'}</ThemedText></Pressable>)}</View>
    <View style={styles.typePicker}>{(['SHORT', 'PAGE'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: type === value }} onPress={() => { setType(value); setValidationError(''); setResult(null); }} style={[styles.typeOption, { borderColor: type === value ? theme.tint : theme.backgroundSelected, backgroundColor: type === value ? theme.backgroundSelected : 'transparent' }]}><ThemedText style={{ color: theme.text, fontWeight: '700' }}>{value === 'SHORT' ? 'Thông báo ngắn' : 'Trang sự kiện'}</ThemedText><ThemedText themeColor="textSecondary" style={styles.hint}>{value === 'SHORT' ? 'Chỉ tiêu đề và nội dung' : 'Preview kèm nội dung dạng block'}</ThemedText></Pressable>)}</View>
    {input('Tiêu đề', title, setTitle, { maxLength: 80 })}{input('Nội dung preview', body, setBody, { maxLength: 180, multiline: true, hint: 'Phần này hiện trong push và inbox.' })}
    {type === 'SHORT' ? <View style={[styles.preview, { backgroundColor: theme.backgroundElement }]}><ThemedText style={styles.previewEyebrow}>XEM TRƯỚC THÔNG BÁO</ThemedText><ThemedText style={styles.previewTitle}>{title || 'Tiêu đề thông báo'}</ThemedText><ThemedText themeColor="textSecondary" style={styles.previewBody}>{body || 'Nội dung hiển thị trong push và inbox.'}</ThemedText></View> : null}
    {type === 'PAGE' ? <View style={styles.blocksSection}><View style={styles.blocksHeading}><ThemedText style={styles.sectionTitle}>Nội dung trang ({blocks.length}/20)</ThemedText></View>
      {blocks.map((block, index) => <View key={`${block.type}-${index}`} style={[styles.blockEditor, { borderBottomColor: theme.backgroundSelected }]}><View style={styles.blockTop}><ThemedText style={styles.label}>{index + 1}. {block.type}</ThemedText><View style={styles.blockActions}><Pressable accessibilityLabel="Di chuyển block lên" disabled={index === 0} onPress={() => setBlocks((current) => move(current, index, index - 1))}><ThemedText style={{ color: index === 0 ? theme.textSecondary : theme.tint }}>↑</ThemedText></Pressable><Pressable accessibilityLabel="Di chuyển block xuống" disabled={index === blocks.length - 1} onPress={() => setBlocks((current) => move(current, index, index + 1))}><ThemedText style={{ color: index === blocks.length - 1 ? theme.textSecondary : theme.tint }}>↓</ThemedText></Pressable><Pressable accessibilityLabel="Xóa block" onPress={() => setBlocks((current) => current.filter((_, itemIndex) => itemIndex !== index))}><ThemedText style={{ color: '#B42318' }}>Xóa</ThemedText></Pressable></View></View>
        {block.type === 'HEADING' || block.type === 'TEXT' ? input(block.type === 'HEADING' ? 'Tiêu đề block' : 'Đoạn văn', block.text, (value) => setBlock(index, { ...block, text: value }), { maxLength: 1600, multiline: block.type === 'TEXT' }) : null}
        {block.type === 'IMAGE' ? <>{input('URL ảnh HTTPS', block.url, (value) => setBlock(index, { ...block, url: value }), { maxLength: 500, hint: 'Dán URL ảnh HTTPS từ dịch vụ lưu trữ hiện có.' })}{input('Mô tả ảnh (alt text)', block.altText ?? '', (value) => setBlock(index, { ...block, altText: value }), { maxLength: 200 })}</> : null}
        {block.type === 'BUTTON' ? <>{input('Nhãn nút', block.label, (value) => setBlock(index, { ...block, label: value }), { maxLength: 80 })}{input('URL HTTPS hoặc pharmashop://', block.url, (value) => setBlock(index, { ...block, url: value }), { maxLength: 500 })}</> : null}
      </View>)}
      <View style={styles.addBlockWrap}><ThemedText style={styles.label}>Thêm block</ThemedText><View style={styles.blockTypes}>{(['HEADING', 'TEXT', 'IMAGE', 'BUTTON', 'DIVIDER'] as const).map((blockType) => button(`+ ${blockType}`, () => setBlocks((current) => [...current, newBlock(blockType)]), blocks.length >= 20, true))}</View></View>
      <View style={[styles.preview, { backgroundColor: theme.backgroundElement }]}><ThemedText style={styles.previewEyebrow}>XEM TRƯỚC TRÊN ĐIỆN THOẠI</ThemedText><ThemedText style={styles.previewTitle}>{title || 'Tiêu đề thông báo'}</ThemedText><ThemedText themeColor="textSecondary" style={styles.previewBody}>{body || 'Nội dung preview'}</ThemedText><View style={styles.previewBlocks}>{blocks.map((block, index) => renderPreview(block, index, theme.tint, theme.text))}</View></View>
    </View> : null}
    {validationError ? <ThemedText accessibilityRole="alert" style={styles.error}>{validationError}</ThemedText> : null}
    {broadcast.error ? <ThemedText accessibilityRole="alert" style={styles.error}>{broadcast.error instanceof ApiError ? broadcast.error.message : 'Không gửi được thông báo. Vui lòng thử lại.'}</ThemedText> : null}
    {result ? <View style={[styles.result, { backgroundColor: theme.backgroundElement }]}><ThemedText style={styles.label}>Đã tạo thông báo</ThemedText><ThemedText themeColor="textSecondary" style={styles.hint}>{result.recipientCount} người nhận inbox · {result.deviceCount} thiết bị được gửi yêu cầu push</ThemedText></View> : null}
    {button(broadcast.isPending ? 'Đang gửi...' : 'Gửi cho tất cả người dùng', submit, broadcast.isPending)}
    </>}
  </ScrollView></SafeAreaView></ThemedView>;
}

function renderPreview(block: NotificationBlock, key: number, tint: string, text: string) {
  if (block.type === 'HEADING') return <ThemedText key={key} style={styles.previewBlockHeading}>{block.text || 'Tiêu đề'}</ThemedText>;
  if (block.type === 'TEXT') return <ThemedText key={key} style={styles.previewBlockText}>{block.text || 'Đoạn văn'}</ThemedText>;
  if (block.type === 'DIVIDER') return <View key={key} style={styles.previewDivider} />;
  if (block.type === 'IMAGE') return block.url ? <Image key={key} source={{ uri: block.url }} contentFit="contain" accessibilityLabel={block.altText || 'Ảnh minh họa'} style={styles.previewImage} /> : <ThemedText key={key} themeColor="textSecondary">[Ảnh: {block.altText || 'chưa có URL'}]</ThemedText>;
  if (block.type === 'BUTTON') return <View key={key} style={[styles.previewButton, { backgroundColor: tint }]}><ThemedText style={{ color: '#fff', fontWeight: '700' }}>{block.label || 'Nút hành động'}</ThemedText><ThemedText style={{ color: '#fff', fontSize: 10, marginTop: 3 }}>{block.url || 'URL sẽ mở khi nhấn'}</ThemedText></View>;
  return null;
}
function move<T>(array: T[], from: number, to: number) { const next = [...array]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; }
function isHttpsUrl(value: string) { try { const url = new URL(value); return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password; } catch { return false; } }
function isActionUrl(value: string) { if (isHttpsUrl(value)) return true; try { const url = new URL(value); return url.protocol === 'pharmashop:' && Boolean(url.hostname) && !url.username && !url.password; } catch { return false; } }

const styles = StyleSheet.create({ page: { flex: 1 }, safe: { flex: 1 }, content: { paddingHorizontal: 20, paddingBottom: 40 }, back: { alignSelf: 'flex-start', paddingVertical: 12 }, heading: { fontSize: 26, lineHeight: 32, fontWeight: '800' }, description: { fontSize: 14, lineHeight: 21, marginTop: 6, marginBottom: 20 }, modeTabs: { flexDirection: 'row', gap: 8, marginBottom: 16 }, modeTab: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 }, history: { marginTop: 4 }, historyHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }, historyItem: { paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth }, historyTitleRow: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' }, empty: { paddingVertical: 24, textAlign: 'center' }, loadMore: { alignItems: 'center', paddingVertical: 16 }, typePicker: { flexDirection: 'row', gap: 10, marginBottom: 10 }, typeOption: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12 }, field: { marginTop: 14 }, fieldHeader: { flexDirection: 'row', justifyContent: 'space-between' }, label: { fontSize: 13, fontWeight: '700' }, counter: { fontSize: 11 }, input: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 6, fontSize: 14 }, textArea: { minHeight: 76, textAlignVertical: 'top' }, hint: { fontSize: 11, lineHeight: 16, marginTop: 4 }, blocksSection: { marginTop: 24 }, blocksHeading: { marginBottom: 8 }, sectionTitle: { fontSize: 17, fontWeight: '800' }, blockEditor: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth }, blockTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, blockActions: { flexDirection: 'row', gap: 14 }, addBlockWrap: { marginTop: 16 }, blockTypes: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 }, button: { minHeight: 42, borderRadius: 10, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', marginTop: 16 }, preview: { padding: 14, borderRadius: 14, marginTop: 22 }, previewEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 0.7 }, previewTitle: { fontSize: 18, fontWeight: '800', marginTop: 9 }, previewBody: { fontSize: 13, lineHeight: 19, marginTop: 5 }, previewBlocks: { gap: 12, marginTop: 14 }, previewBlockHeading: { fontSize: 17, fontWeight: '800' }, previewBlockText: { fontSize: 13, lineHeight: 20 }, previewDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#ADB8B4' }, previewImage: { height: 160, width: '100%', borderRadius: 10 }, previewButton: { minHeight: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, result: { borderRadius: 12, padding: 13, marginTop: 16 }, error: { color: '#B42318', marginTop: 12 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 22 } });

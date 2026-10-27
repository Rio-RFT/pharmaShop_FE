import { AppHeader } from '@/components/app-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import * as AdminApi from '@/features/admin/api/admin';
import { useAuth } from '@/features/auth/auth-provider';
import { onCredentialsChanged, readCredential } from '@/features/auth/token-storage';
import { useTheme } from '@/hooks/use-theme';
import { API_BASE_URL, ApiError } from '@/shared/api/client';
import { LoadingIndicator } from '@/shared/components/loading-indicator';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View, type ImageStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { io, type Socket } from 'socket.io-client';
import { usePullToRefresh } from '@/shared/hooks/use-pull-to-refresh';

type Section = 'overview' | 'chat' | 'medicines' | 'categories' | 'coupons' | 'orders' | 'users';
type MenuItemId = Section | 'broadcast';
const sections: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Tổng quan' }, { id: 'chat', label: 'Tin nhắn' }, { id: 'medicines', label: 'Sản phẩm' }, { id: 'categories', label: 'Danh mục' },
  { id: 'coupons', label: 'Mã giảm giá' }, { id: 'orders', label: 'Đơn hàng' }, { id: 'users', label: 'Người dùng' },
];
const menuItems: { id: MenuItemId; label: string }[] = [...sections, { id: 'broadcast', label: 'Thông báo' }];
const menuIcons = {
  overview: { ios: 'square.grid.2x2', android: 'dashboard', web: 'dashboard' },
  chat: { ios: 'bubble.left.and.bubble.right', android: 'forum', web: 'forum' },
  medicines: { ios: 'cross.case', android: 'medication', web: 'medication' },
  categories: { ios: 'square.grid.2x2', android: 'category', web: 'category' },
  coupons: { ios: 'tag', android: 'sell', web: 'sell' },
  orders: { ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' },
  users: { ios: 'person.2', android: 'group', web: 'group' },
  broadcast: { ios: 'bell.badge', android: 'campaign', web: 'campaign' },
} as const;
const chatImageStyle: ImageStyle = { width: 210, height: 150, borderRadius: 10, marginTop: 8 };
const productImageStyle: ImageStyle = { width: 54, height: 54, borderRadius: 8, backgroundColor: '#fff' };
const statuses = ['PENDING', 'CONFIRMED', 'SHIPPING', 'COMPLETED', 'CANCELLED'];
const emptyMedicine = { name: '', activeIngredient: '', category: '', price: '', stockQuantity: '0', packaging: '', unit: 'Hộp', imageUrl: '' };
const emptyCoupon = { code: '', discountType: 'PERCENTAGE', discountValue: '', minOrderAmount: '0', maxDiscount: '', expiresAt: '', usageLimit: '' };
const emptyCategory = { name: '', imageUrl: '', parentId: '' };

export default function AdminScreen() {
  const theme = useTheme(); const router = useRouter(); const queryClient = useQueryClient(); const { user, loading: authLoading } = useAuth();
  const routeParams = useLocalSearchParams<{ section?: string }>();
  const requestedSection = routeParams.section === 'chat' ? 'chat' : 'overview';
  const [section, setSection] = useState<Section>(requestedSection); const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const menuTranslateX = useRef(new Animated.Value(-360)).current;
  const menuBackdropOpacity = useRef(new Animated.Value(0)).current;
  const [chatStatus, setChatStatus] = useState<AdminApi.ChatStatus | undefined>(); const [message, setMessage] = useState('');
  const [customerTyping, setCustomerTyping] = useState('');
  const customerTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inboxTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inboxTypingActive = useRef(false);
  const lastInboxTypingAt = useRef(0);
  const [search, setSearch] = useState(''); const [formVisible, setFormVisible] = useState(false); const [editingId, setEditingId] = useState<string | null>(null);
  const [listPage, setListPage] = useState(1);
  const [medicineForm, setMedicineForm] = useState(emptyMedicine); const [couponForm, setCouponForm] = useState(emptyCoupon);
  const [couponFormError, setCouponFormError] = useState('');
  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [categoryImportVisible, setCategoryImportVisible] = useState(false); const [categoryImportJson, setCategoryImportJson] = useState(''); const [categoryImportBusy, setCategoryImportBusy] = useState(false);
  const [medicineImportVisible, setMedicineImportVisible] = useState(false); const [medicineImportJson, setMedicineImportJson] = useState(''); const [medicineImportPreviewJson, setMedicineImportPreviewJson] = useState(''); const [medicineImportBusy, setMedicineImportBusy] = useState(false);
  const pendingProductBatch = useRef<{ idempotencyKey: string; items: AdminApi.MedicineImportItem[]; offset: number } | null>(null);
  const pendingCategoryBatch = useRef<AdminApi.MedicineCategoryImportItem[] | null>(null);
  const [chatSocket, setChatSocket] = useState<Socket | null>(null);
  const [credentialRevision, setCredentialRevision] = useState(0);
  const palette = useMemo(() => ({ foreground: theme.text, secondary: theme.textSecondary, surface: theme.backgroundElement, selected: theme.backgroundSelected, accent: theme.tint }), [theme]);
  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => onCredentialsChanged(() => setCredentialRevision((revision) => revision + 1)), []);

  useFocusEffect(useCallback(() => {
    let socket: Socket | undefined; let mounted = true;
    if (isAdmin) void readCredential('access').then((token) => {
      if (!token || !mounted) return;
      socket = io(API_BASE_URL.replace(/\/api\/v1\/?$/, ''), { auth: { token }, transports: ['websocket', 'polling'], reconnection: true });
      socket.on('connect', () => { socket?.emit('join_pharmacist_room'); if (selectedChat) socket?.emit('chat:join', { conversationId: selectedChat }); });
      socket.on('disconnect', () => { setCustomerTyping(''); if (customerTypingTimer.current) clearTimeout(customerTypingTimer.current); });
      socket.on('chat:message', () => { void queryClient.invalidateQueries({ queryKey: ['admin-chat-messages', selectedChat] }); void queryClient.invalidateQueries({ queryKey: ['admin-chat'] }); });
      socket.on('chat:conversation_updated', () => { void queryClient.invalidateQueries({ queryKey: ['admin-chat'] }); });
      socket.on('chat:typing', (event: unknown) => {
        if (!event || typeof event !== 'object') return;
        const typing = event as { actorId?: string; actorRole?: string; actorName?: string; isTyping?: boolean; conversationId?: string };
        if (typing.conversationId !== selectedChat || typing.actorRole !== 'CUSTOMER' || typing.actorId === user?.id) return;
        if (customerTypingTimer.current) clearTimeout(customerTypingTimer.current);
        if (typing.isTyping) {
          setCustomerTyping(`${typing.actorName ?? 'Kh\u00e1ch h\u00e0ng'} \u0111ang nh\u1eadp\u2026`);
          customerTypingTimer.current = setTimeout(() => setCustomerTyping(''), 4_500);
        } else setCustomerTyping('');
      });
      setChatSocket(socket);
    });
    return () => { mounted = false; socket?.disconnect(); setChatSocket(null); };
  }, [credentialRevision, isAdmin, queryClient, selectedChat]));

  const stopInboxTyping = useCallback(() => {
    if (inboxTypingTimer.current) clearTimeout(inboxTypingTimer.current);
    inboxTypingTimer.current = null;
    if (inboxTypingActive.current && chatSocket?.connected && selectedChat) chatSocket.emit('chat:typing', { conversationId: selectedChat, isTyping: false });
    inboxTypingActive.current = false;
  }, [chatSocket, selectedChat]);
  const handleInboxDraftChange = useCallback((value: string) => {
    setMessage(value);
    if (!value.trim() || !selectedChat) { stopInboxTyping(); return; }
    const now = Date.now();
    if (chatSocket?.connected && (!inboxTypingActive.current || now - lastInboxTypingAt.current >= 2_500)) {
      chatSocket.emit('chat:typing', { conversationId: selectedChat, isTyping: true });
      inboxTypingActive.current = true;
      lastInboxTypingAt.current = now;
    }
    if (inboxTypingTimer.current) clearTimeout(inboxTypingTimer.current);
    inboxTypingTimer.current = setTimeout(stopInboxTyping, 3_500);
  }, [chatSocket, selectedChat, stopInboxTyping]);

  const chats = useQuery({ queryKey: ['admin-chat', chatStatus], queryFn: () => AdminApi.listChat(chatStatus), enabled: isAdmin && section === 'chat', refetchInterval: 30000 });
  const messages = useQuery({ queryKey: ['admin-chat-messages', selectedChat], queryFn: () => AdminApi.getChatMessages(selectedChat!), enabled: isAdmin && !!selectedChat, refetchInterval: 12000 });
  const users = useQuery({ queryKey: ['admin-users', search, listPage], queryFn: () => AdminApi.listUsers(listPage, search || undefined), enabled: isAdmin && section === 'users' });
  const medicines = useQuery({ queryKey: ['admin-medicines', search, listPage], queryFn: () => AdminApi.listMedicines(listPage, search || undefined), enabled: isAdmin && section === 'medicines' });
  const medicineCategories = useQuery({ queryKey: ['admin-medicine-categories'], queryFn: AdminApi.listMedicineCategories, enabled: isAdmin && section === 'medicines' });
  const coupons = useQuery({ queryKey: ['admin-coupons'], queryFn: AdminApi.listCoupons, enabled: isAdmin && section === 'coupons' });
  const categories = useQuery({ queryKey: ['admin-medicine-categories'], queryFn: AdminApi.listMedicineCategories, enabled: isAdmin && section === 'categories' });
  const pullRefresh = usePullToRefresh();
  const productPreviewRows = readImportRows(medicineImportPreviewJson, 'products');
  const categoryPreviewRows = readImportRows(categoryImportJson, 'categories');
  const medicineCategoryParentIds = new Set((medicineCategories.data ?? []).map((item) => item.parentId).filter((id): id is string => !!id));
  const activeCategoryNames = new Set((medicineCategories.data ?? []).filter((item) => item.isActive && !medicineCategoryParentIds.has(item.id)).map((item) => item.name.trim()));
  const embeddedCategories = readCombinedImportRows(medicineImportPreviewJson, 'categories');
  const embeddedParentIds = new Set(embeddedCategories.map((raw) => (raw as Record<string, unknown>)?.parentId).filter((id): id is string => typeof id === 'string'));
  embeddedCategories.forEach((raw) => { const item = raw as Record<string, unknown>; if (typeof item?.name === 'string' && typeof item.id === 'string' && embeddedParentIds.has(item.id)) return; if (typeof item?.name === 'string' && isCategoryImportRecord({ name: item.name.trim(), ...(item.imageUrl !== undefined ? { imageUrl: item.imageUrl } : {}), ...(item.parentId !== undefined ? { parentId: item.parentId } : {}) })) activeCategoryNames.add(item.name.trim()); });
  const productPreviewInvalidCount = productPreviewRows.filter((item) => { const normalized = normalizeMedicineImportItem(item); return !normalized || !isMedicineImportRecord(normalized, activeCategoryNames); }).length;
  const categoryPreviewInvalidCount = categoryPreviewRows.filter((item) => !isCategoryImportRecord(item)).length;
  const categoryChildren = new Set((categories.data ?? []).map((item) => item.parentId).filter((id): id is string => !!id));
  const activeLeafCategories = (categories.data ?? []).filter((item) => item.isActive && !categoryChildren.has(item.id));
  const duplicateCategoryCount = categoryPreviewRows.length - new Set(categoryPreviewRows.map((raw) => (raw as Record<string, unknown>)?.name).filter((name): name is string => typeof name === 'string').map((name) => name.trim())).size;
  const orders = useQuery({ queryKey: ['admin-orders', listPage], queryFn: () => AdminApi.listOrders(listPage), enabled: isAdmin && section === 'orders' });

  const invalidate = async (...keys: string[]) => Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
  const accept = useMutation({ mutationFn: AdminApi.acceptChat, onSuccess: async () => { await invalidate('admin-chat'); if (selectedChat) await queryClient.invalidateQueries({ queryKey: ['admin-chat-messages', selectedChat] }); } });
  const send = useMutation({ mutationFn: (input: { id: string; content: string }) => AdminApi.sendChatMessage(input.id, { content: input.content, clientMessageId: `${Date.now()}-${Math.random().toString(36).slice(2)}` }), onSuccess: () => { setMessage(''); if (selectedChat) void queryClient.invalidateQueries({ queryKey: ['admin-chat-messages', selectedChat] }); } });
  const close = useMutation({ mutationFn: AdminApi.closeChat, onSuccess: () => { void invalidate('admin-chat'); } });
  const archive = useMutation({ mutationFn: AdminApi.archiveChat, onSuccess: () => { void invalidate('admin-chat'); } });
  const reopen = useMutation({ mutationFn: AdminApi.reopenChat, onSuccess: () => { void invalidate('admin-chat'); } });
  const userUpdate = useMutation({ mutationFn: ({ id, role, isActive }: { id: string; role?: AdminApi.AdminUser['role']; isActive?: boolean }) => AdminApi.updateUser(id, { role, isActive }), onSuccess: () => { void invalidate('admin-users'); } });
  const saveMedicine = useMutation({ mutationFn: () => { const body = { ...medicineForm, price: Number(medicineForm.price), stockQuantity: Number(medicineForm.stockQuantity) }; return editingId ? AdminApi.updateMedicine(editingId, body) : AdminApi.createMedicine(body); }, onSuccess: async () => { setFormVisible(false); await invalidate('admin-medicines', 'medicines'); } });
  const removeMedicine = useMutation({ mutationFn: AdminApi.deleteMedicine, onSuccess: () => { void invalidate('admin-medicines', 'medicines'); } });
  const importMedicinesFromJson = async () => {
    if (medicineImportBusy) return;
    let parsed: unknown;
    try { parsed = JSON.parse(medicineImportJson); } catch { Alert.alert('JSON không hợp lệ', 'Kiểm tra lại nội dung JSON.'); return; }
    const object = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as { products?: unknown; categories?: unknown } : null;
    const source = Array.isArray(parsed) ? parsed : Array.isArray(object?.products) ? object.products : null;
    if (!source?.length) { Alert.alert('Không có sản phẩm', 'JSON cần là mảng hoặc object có products[].'); return; }
    const medicineCategoryChildren = new Set((medicineCategories.data ?? []).map((item) => item.parentId).filter((id): id is string => !!id));
    let activeCategories = new Set((medicineCategories.data ?? []).filter((item) => item.isActive && !medicineCategoryChildren.has(item.id)).map((item) => item.name.trim()));
    const categoryNamesById = new Map((medicineCategories.data ?? []).filter((item) => item.isActive && !medicineCategoryChildren.has(item.id)).map((item) => [item.id, item.name.trim()]));
    const categoryInput = Array.isArray(object?.categories) ? object.categories : [];
    if (categoryInput.length) {
      const categoryItems = categoryInput.map((raw) => { const item = raw as Record<string, unknown>; return { name: typeof item?.name === 'string' ? item.name.trim() : '', ...(item?.imageUrl !== undefined ? { imageUrl: typeof item.imageUrl === 'string' ? normalizeImportUrl(item.imageUrl) : item.imageUrl as null } : {}), ...(typeof item?.parentId === 'string' ? { parentId: item.parentId } : {}) }; });
      if (categoryItems.some((item) => !isCategoryImportRecord(item))) { Alert.alert('Danh mục không hợp lệ', 'Kiểm tra name và imageUrl HTTPS.'); return; }
      const merged = [...new Map((categoryItems as AdminApi.MedicineCategoryImportItem[]).map((item) => [item.name, item])).values()];
      try {
        const categoryReport = await importCategoriesInBatches(merged);
        if (categoryReport.failed) {
          const failures = categoryReport.results.filter((result) => result.status === 'failed');
          Alert.alert('Danh mục có lỗi', failures.slice(0, 3).map((item) => `${item.index + 1}: ${item.error}`).join('\n') + (failures.length > 3 ? `\n...và ${failures.length - 3} lỗi khác` : ''));
          return;
        }
        const importedParentIds = new Set(merged.map((item) => item.parentId).filter((id): id is string => !!id));
        categoryReport.results.filter((result) => result.status !== 'failed').forEach((result) => { if (result.category?.isActive) { activeCategories.add(result.category.name.trim()); categoryNamesById.set(result.category.id, result.category.name.trim()); } });
        importedParentIds.forEach((id) => { const parentName = categoryNamesById.get(id); if (parentName) activeCategories.delete(parentName); });
        await invalidate('admin-medicine-categories', 'medicines', 'category-artwork');
      } catch (error) { Alert.alert('Import danh mục thất bại', error instanceof Error ? error.message : 'API error'); return; }
    }
    const importableCategoryNames = categoryInput.map((raw) => (raw as Record<string, unknown>)?.name).filter((name): name is string => typeof name === 'string').map((name) => name.trim());
    const categoryCandidates = new Set(importableCategoryNames.length ? importableCategoryNames : [...activeCategories]);
    const singleCategory = categoryCandidates.size === 1 ? [...categoryCandidates][0] : null;
    const normalized = source.map((raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return normalizeMedicineImportItem(raw);
      const item = raw as Record<string, unknown>;
      const mappedCategoryName = typeof item.categoryId === 'string' ? categoryNamesById.get(item.categoryId) : undefined;
      const category = mappedCategoryName ?? (typeof item.category === 'string' && item.category.trim().toLocaleLowerCase('en') === 'abc' && singleCategory ? singleCategory : item.category);
      return normalizeMedicineImportItem({ ...item, category });
    });
    const invalidIndex = normalized.findIndex((item) => !item || !isMedicineImportRecord(item, activeCategories));
    if (invalidIndex >= 0) { Alert.alert('Dữ liệu chưa hợp lệ', `Sản phẩm ${invalidIndex + 1} thiếu trường bắt buộc, sai giới hạn hoặc category chưa active.`); return; }
    const allItems = normalized as AdminApi.MedicineImportItem[];
    setMedicineImportBusy(true);
    try {
      let created = 0; let duplicate = 0; let failed = 0; const errors: string[] = []; const failedItems: AdminApi.MedicineImportItem[] = [];
      let offset = pendingProductBatch.current?.offset ?? 0;
      while (offset < allItems.length) {
        if (!pendingProductBatch.current) pendingProductBatch.current = { idempotencyKey: createImportKey(), items: allItems.slice(offset, offset + 100), offset };
        const batch = pendingProductBatch.current;
        const report = await AdminApi.importMedicines({ idempotencyKey: batch.idempotencyKey, items: batch.items });
        created += report.created; duplicate += report.duplicate; failed += report.failed;
        report.results.filter((item) => item.status === 'failed').forEach((item) => errors.push(`${batch.offset + item.index + 1}: ${item.error ?? 'Import failed'}`));
        if (report.failed) {
          failedItems.push(...report.results.filter((item) => item.status === 'failed').map((item) => batch.items[item.index]));
        }
        offset = batch.offset + batch.items.length;
        pendingProductBatch.current = null;
      }
      if (failedItems.length) setMedicineImportJson(JSON.stringify(failedItems, null, 2));
      await invalidate('admin-medicines', 'medicines', 'category-artwork');
      Alert.alert('Kết quả import', `Tạo ${created}, trùng ${duplicate}, lỗi ${failed}.${errors.length ? `\n${errors.slice(0, 8).join('\n')}` : ''}`);
      if (!failed) { setMedicineImportJson(''); setMedicineImportVisible(false); }
    } catch (error) {
      Alert.alert('Chưa xác nhận được kết quả', `${error instanceof Error ? error.message : 'Lỗi mạng/API'}. Nhấn import lại để gửi cùng batch với idempotency key hiện tại.`);
    } finally { setMedicineImportBusy(false); }
  };
  const saveCoupon = useMutation({ mutationFn: () => { const body = { code: couponForm.code.trim().toUpperCase(), discountType: couponForm.discountType, discountValue: Number(couponForm.discountValue), minOrderAmount: Number(couponForm.minOrderAmount || 0), ...(couponForm.discountType === 'PERCENTAGE' && couponForm.maxDiscount ? { maxDiscount: Number(couponForm.maxDiscount) } : {}), ...(couponForm.usageLimit ? { usageLimit: Number(couponForm.usageLimit) } : {}), expiresAt: new Date(`${couponForm.expiresAt}T23:59:59.999Z`).toISOString() }; return editingId ? AdminApi.updateCoupon(editingId, body) : AdminApi.createCoupon(body); }, onSuccess: async () => { setFormVisible(false); setCouponFormError(''); await invalidate('admin-coupons', 'coupons'); } });
  const saveCategory = useMutation({ mutationFn: () => {
    const name = categoryForm.name.trim(); const imageUrl = categoryForm.imageUrl.trim();
    return editingId
      ? AdminApi.updateMedicineCategory(editingId, { name, imageUrl: imageUrl || null, parentId: categoryForm.parentId || null })
      : AdminApi.createMedicineCategory({ name, ...(imageUrl ? { imageUrl } : {}), ...(categoryForm.parentId ? { parentId: categoryForm.parentId } : {}) });
  }, onSuccess: async () => { setFormVisible(false); await invalidate('admin-medicine-categories', 'medicines', 'category-artwork', 'medicines-search'); } });
  const updateCategory = useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => AdminApi.updateMedicineCategory(id, { isActive }), onSuccess: async () => { await invalidate('admin-medicine-categories', 'medicines', 'category-artwork'); } });
  const deactivateCategory = useMutation({ mutationFn: AdminApi.deactivateMedicineCategory, onSuccess: async () => { await invalidate('admin-medicine-categories', 'medicines', 'category-artwork'); } });
  const importCategories = async () => {
    if (categoryImportBusy) return;
    let parsed: unknown;
    try { parsed = JSON.parse(categoryImportJson); } catch { Alert.alert('JSON không hợp lệ', 'Kiểm tra nội dung danh mục.'); return; }
    const source = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' && Array.isArray((parsed as { categories?: unknown }).categories) ? (parsed as { categories: unknown[] }).categories : null;
    if (!source?.length) { Alert.alert('Không có danh mục', 'JSON cần là mảng hoặc object có categories[].'); return; }
    const items = source.map((raw) => { const item = raw as Record<string, unknown>; return { name: typeof item?.name === 'string' ? item.name.trim() : '', ...(item?.imageUrl !== undefined ? { imageUrl: typeof item.imageUrl === 'string' ? normalizeImportUrl(item.imageUrl) : item.imageUrl as null } : {}), ...(typeof item?.parentId === 'string' ? { parentId: item.parentId } : {}) }; });
    if (items.some((item) => !isCategoryImportRecord(item))) { Alert.alert('Dữ liệu không hợp lệ', 'Kiểm tra name và imageUrl HTTPS/null tùy chọn.'); return; }
    const existingActiveIds = new Set((categories.data ?? []).filter((item) => item.isActive).map((item) => item.id));
    const missingParent = items.find((item) => item.parentId && !existingActiveIds.has(item.parentId));
    if (missingParent) { Alert.alert('Danh mục cha chưa hợp lệ', `Danh mục “${missingParent.name}” cần parentId của một danh mục cha đang hoạt động đã tồn tại.`); return; }
    const merged = [...new Map((items as AdminApi.MedicineCategoryImportItem[]).map((item) => [item.name.trim(), { ...item, name: item.name.trim() }])).values()];
    if (!categories.data) { Alert.alert('Chưa tải danh mục', 'Tải lại danh sách trước khi import.'); return; }
    pendingCategoryBatch.current = merged;
    setCategoryImportBusy(true);
    try {
      const report = await importCategoriesInBatches(pendingCategoryBatch.current);
      await invalidate('admin-medicine-categories', 'medicines', 'category-artwork');
      const failures = report.results.filter((item) => item.status === 'failed');
      if (failures.length) {
        setCategoryImportJson(JSON.stringify(failures.map((item) => merged[item.index]), null, 2));
        pendingCategoryBatch.current = null;
      }
      Alert.alert('Kết quả import', `Tạo ${report.created}, cập nhật ${report.updated}, lỗi ${report.failed}. Gộp ${items.length - merged.length} tên bị lặp.${failures.length ? `\n${failures.slice(0, 3).map((item) => `${item.index + 1}: ${item.error}`).join('\n') + (failures.length > 3 ? `\n...và ${failures.length - 3} lỗi khác` : '')}` : ''}`);
      if (!report.failed) { pendingCategoryBatch.current = null; setCategoryImportJson(''); setCategoryImportVisible(false); }
    } catch (error) { Alert.alert('Import chưa hoàn tất', `${error instanceof Error ? error.message : 'Lỗi mạng/API'}. Nhấn import lại để gửi lại cùng dữ liệu.`); }
    finally { setCategoryImportBusy(false); }
  };
  const disableCoupon = useMutation({ mutationFn: AdminApi.disableCoupon, onSuccess: () => { void invalidate('admin-coupons', 'coupons'); } });
  const orderUpdate = useMutation({ mutationFn: ({ id, status, paymentStatus }: { id: string; status: string; paymentStatus?: string }) => AdminApi.updateOrder(id, { status, paymentStatus }), onSuccess: () => { void invalidate('admin-orders', 'orders'); } });

  useEffect(() => { if (user && user.role !== 'ADMIN') router.replace('/'); }, [user, router]);
  useEffect(() => { if (routeParams.section === 'chat') { setSection('chat'); setSelectedChat(null); } }, [routeParams.section]);
  if (authLoading) return <ThemedView style={styles.center}><LoadingIndicator size={52} color={theme.tint} /></ThemedView>;
  if (!isAdmin) return <ThemedView style={styles.center}><ThemedText style={styles.title}>Chỉ tài khoản ADMIN mới truy cập được.</ThemedText><Pressable onPress={() => router.back()}><ThemedText style={{ color: theme.tint }}>Quay lại</ThemedText></Pressable></ThemedView>;

  const openMedicine = (item?: AdminApi.AdminMedicine) => { setEditingId(item?.id ?? null); setMedicineForm(item ? { name: item.name, activeIngredient: item.activeIngredient, category: item.category, price: String(item.price), stockQuantity: String(item.stockQuantity), packaging: item.packaging, unit: item.unit ?? 'Hộp', imageUrl: item.imageUrl ?? '' } : emptyMedicine); setFormVisible(true); };
  const openCoupon = (item?: AdminApi.AdminCoupon) => { setEditingId(item?.id ?? null); setCouponForm(item ? { code: item.code, discountType: item.discountType, discountValue: String(item.discountValue), minOrderAmount: String(item.minOrderAmount), maxDiscount: item.maxDiscount ? String(item.maxDiscount) : '', expiresAt: item.expiresAt.slice(0, 10), usageLimit: item.usageLimit ? String(item.usageLimit) : '' } : emptyCoupon); setCouponFormError(''); saveCoupon.reset(); setFormVisible(true); };
  const submitCoupon = () => { const validation = validateCouponForm(couponForm); setCouponFormError(validation ?? ''); if (!validation) saveCoupon.mutate(); };
  const openCategory = (item?: AdminApi.AdminMedicineCategory) => { setEditingId(item?.id ?? null); setCategoryForm(item ? { name: item.name, imageUrl: item.imageUrl ?? '', parentId: item.parentId ?? '' } : emptyCategory); setFormVisible(true); };
  const confirm = (title: string, body: string, action: () => void) => Alert.alert(title, body, [{ text: 'Hủy', style: 'cancel' }, { text: 'Xác nhận', style: 'destructive', onPress: action }]);
  const renderError = (error: unknown) => error ? <ThemedText accessibilityRole="alert" style={styles.error}>{error instanceof ApiError ? error.message : 'Không thể tải dữ liệu.'}</ThemedText> : null;
  const renderLoading = (query: { isLoading: boolean }) => query.isLoading ? <LoadingIndicator size={48} color={theme.tint} /> : null;
  const button = (label: string, action: () => void, secondary = false, disabled = false) => <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={action} style={[styles.button, { backgroundColor: secondary ? palette.selected : palette.accent, opacity: disabled ? 0.55 : 1 }]}><ThemedText style={[styles.buttonText, secondary && { color: palette.foreground }]}>{label}</ThemedText></Pressable>;
  const row = (title: string, detail: string, actions: React.ReactNode, key?: string) => <View key={key ?? `${title}-${detail}`} style={[styles.row, { borderBottomColor: palette.selected }]}><View style={styles.rowBody}><ThemedText style={styles.rowTitle}>{title}</ThemedText><ThemedText themeColor="textSecondary" style={styles.rowDetail}>{detail}</ThemedText></View><View style={styles.rowActions}>{actions}</View></View>;
  const renderCategoryBranch = (parentId: string | null, depth = 0, visited = new Set<string>()): React.ReactNode[] => (categories.data ?? [])
    .filter((item) => item.parentId === parentId || (!parentId && item.parentId && !(categories.data ?? []).some((candidate) => candidate.id === item.parentId)))
    .filter((item) => !visited.has(item.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    .flatMap((item) => {
      const nextVisited = new Set(visited); nextVisited.add(item.id);
      const hasChildren = (categories.data ?? []).some((candidate) => candidate.parentId === item.id);
      return [<View key={`category-indent-${item.id}`} style={{ marginLeft: Math.min(depth * 16, 64) }}>{row(item.name, `${hasChildren ? 'Danh mục cha' : 'Danh mục lá'} · ${item.isActive ? 'Đang hoạt động' : 'Đang ẩn'}${item.imageUrl ? ' · Có ảnh' : ''}`, <>{smallButton('Sửa', () => openCategory(item))}{item.isActive ? smallButton('Ẩn', () => confirm('Ẩn danh mục?', `${hasChildren ? 'Hãy chuyển hoặc ẩn các danh mục con đang hoạt động trước. ' : ''}${item.name}`, () => deactivateCategory.mutate(item.id)), true) : smallButton('Hiện', () => updateCategory.mutate({ id: item.id, isActive: true }))}</>, item.id)}</View>, ...renderCategoryBranch(item.id, depth + 1, nextVisited)];
    });
  const smallButton = (label: string, action: () => void, danger = false, key?: string) => <Pressable key={key} accessibilityRole="button" onPress={action} style={[styles.smallButton, { borderColor: danger ? '#B42318' : palette.accent }]}><ThemedText style={{ color: danger ? '#B42318' : palette.accent, fontWeight: '700', fontSize: 12 }}>{label}</ThemedText></Pressable>;
  const discountTypeSelector = <View style={[styles.discountTypePicker, { backgroundColor: palette.surface }]}>{([{ value: 'PERCENTAGE', label: 'Phần trăm', hint: 'Giảm theo %' }, { value: 'FIXED_AMOUNT', label: 'Số tiền', hint: 'Giảm theo ₫' }] as const).map((option) => { const selected = couponForm.discountType === option.value; return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => { setCouponForm({ ...couponForm, discountType: option.value, ...(option.value === 'FIXED_AMOUNT' ? { maxDiscount: '' } : {}) }); setCouponFormError(''); }} style={[styles.discountTypeOption, selected && { backgroundColor: palette.accent }]}><ThemedText style={[styles.discountTypeLabel, { color: selected ? '#FFFFFF' : palette.foreground }]}>{option.label}</ThemedText><ThemedText style={[styles.discountTypeHint, { color: selected ? '#E5FFF5' : palette.secondary }]}>{option.hint}</ThemedText></Pressable>; })}</View>;
  const activeSectionLabel = sections.find((item) => item.id === section)?.label ?? 'Quản trị';
  const openMenu = () => {
    menuTranslateX.setValue(-360);
    menuBackdropOpacity.setValue(0);
    setMenuVisible(true);
    requestAnimationFrame(() => Animated.parallel([
      Animated.timing(menuTranslateX, { toValue: 0, duration: 240, useNativeDriver: true }),
      Animated.timing(menuBackdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start());
  };
  const closeMenu = () => {
    Animated.parallel([
      Animated.timing(menuTranslateX, { toValue: -360, duration: 200, useNativeDriver: true }),
      Animated.timing(menuBackdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) setMenuVisible(false); });
  };
  const selectMenuItem = (id: MenuItemId) => {
    closeMenu();
    if (id === 'broadcast') {
      router.push('/admin/notifications' as import('expo-router').Href);
      return;
    }
    if (selectedChat) chatSocket?.emit('chat:leave', { conversationId: selectedChat });
    setSection(id);
    setSelectedChat(null);
    setListPage(1);
    setSearch('');
  };

  return <ThemedView style={styles.page}><SafeAreaView style={styles.safe} edges={['top']}><AppHeader />
    <View style={[styles.adminBar, { borderBottomColor: palette.selected }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Mở menu quản trị" onPress={openMenu} style={[styles.menuButton, { backgroundColor: palette.surface }]}>
        <SymbolView name={{ ios: 'line.3.horizontal', android: 'menu', web: 'menu' }} size={22} tintColor={palette.foreground} />
      </Pressable>
      <View style={styles.adminBarCopy}>
        <ThemedText style={styles.adminBarTitle} numberOfLines={1}>{activeSectionLabel}</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.adminBarSubtitle} numberOfLines={1}>Quản trị PharmaShop · {user?.fullName}</ThemedText>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Trở về trang chủ" onPress={() => router.navigate('/')} style={[styles.homeButton, { backgroundColor: palette.surface }]}>
        <SymbolView name={{ ios: 'house', android: 'home', web: 'home' }} size={21} tintColor={palette.foreground} />
      </Pressable>
    </View>
    <ScrollView alwaysBounceVertical refreshControl={<RefreshControl refreshing={pullRefresh.refreshing} onRefresh={() => void pullRefresh.onRefresh()} tintColor={theme.tint} colors={[theme.tint]} />} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    {section === 'overview' ? <View style={styles.overview}><ThemedText style={styles.sectionTitle}>Khu vực quản trị</ThemedText>{sections.slice(1).map((item) => <Pressable key={item.id} onPress={() => selectMenuItem(item.id)} style={[styles.overviewRow, { borderBottomColor: palette.selected }]}><ThemedText style={styles.rowTitle}>{item.label}</ThemedText><ThemedText style={{ color: palette.accent }}>Mở ›</ThemedText></Pressable>)}</View> : null}

    {section === 'chat' ? <View style={styles.sectionWrap}>
      <View style={styles.heading}><ThemedText style={styles.sectionTitle}>Hộp thư hỗ trợ</ThemedText>{selectedChat ? <Pressable onPress={() => { chatSocket?.emit('chat:leave', { conversationId: selectedChat }); setSelectedChat(null); }}><ThemedText style={{ color: palette.accent }}>Danh sách</ThemedText></Pressable> : null}</View>
      {!selectedChat ? <><ScrollView horizontal contentContainerStyle={styles.filterRow}>{(['Tất cả', 'WAITING_FOR_STAFF', 'ASSIGNED', 'CLOSURE_PENDING', 'ARCHIVED'] as const).map((status) => <Pressable key={status} onPress={() => setChatStatus(status === 'Tất cả' ? undefined : status)} style={[styles.filter, { backgroundColor: (chatStatus ?? 'Tất cả') === status ? palette.selected : palette.surface }]}><ThemedText style={{ color: palette.foreground, fontSize: 12 }}>{status === 'Tất cả' ? status : status.replaceAll('_', ' ')}</ThemedText></Pressable>)}</ScrollView>{renderLoading(chats)}{renderError(chats.error)}{chats.data?.items.map((chat) => <Pressable key={chat.id} onPress={() => router.push({ pathname: '/admin/chat/[id]', params: { id: chat.id, customerName: chat.customer.fullName, status: chat.status, assignedStaffName: chat.assignedStaffName ?? '' } })} style={[styles.chatRow, { borderBottomColor: palette.selected }]}><View style={[styles.chatAvatar, { backgroundColor: palette.selected }]}><ThemedText style={{ color: palette.accent, fontWeight: '800' }}>{chat.customer.fullName.trim().split(/\s+/).slice(-2).map((part) => part[0]?.toLocaleUpperCase('vi') ?? '').join('')}</ThemedText></View><View style={{ flex: 1 }}><ThemedText numberOfLines={1} style={styles.rowTitle}>{chat.customer.fullName}</ThemedText><ThemedText numberOfLines={1} themeColor="textSecondary" style={styles.rowDetail}>{chat.assignedStaffName ?? chat.status.replaceAll('_', ' ')} · {new Date(chat.lastMessageAt).toLocaleString('vi-VN')}</ThemedText></View><SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={17} tintColor={palette.secondary} /></Pressable>)}</> : <>
        {renderLoading(messages)}{renderError(messages.error)}<View style={[styles.thread, { backgroundColor: palette.surface }]}>{messages.data?.items.map((item) => <View key={item.id} style={[styles.bubble, { alignSelf: item.senderRole === 'ADMIN' ? 'flex-end' : 'flex-start', backgroundColor: item.senderRole === 'ADMIN' ? palette.accent : palette.selected }]}><ThemedText style={{ color: item.senderRole === 'ADMIN' ? '#fff' : palette.foreground }}>{item.type === 'SYSTEM' ? `• ${item.content}` : item.content}</ThemedText>{item.attachment?.['url'] ? <Image source={{ uri: String(item.attachment['url']) }} contentFit="cover" accessibilityLabel="Ảnh khách gửi" style={chatImageStyle} /> : null}{item.product?.['name'] ? <View style={styles.productEmbed}>{typeof item.product['imageUrl'] === 'string' ? <Image source={{ uri: item.product['imageUrl'] }} contentFit="contain" accessibilityLabel={String(item.product['name'])} style={productImageStyle} /> : null}<View style={{ flex: 1 }}><ThemedText style={{ color: item.senderRole === 'ADMIN' ? '#fff' : palette.foreground, fontWeight: '700' }}>{String(item.product['name'])}</ThemedText><ThemedText style={{ color: item.senderRole === 'ADMIN' ? '#E5FFF5' : palette.secondary, fontSize: 12 }}>{item.product['price'] ? `${Number(item.product['price']).toLocaleString('vi-VN')} ₫` : ''}</ThemedText></View></View> : null}{item.senderName ? <ThemedText style={{ color: item.senderRole === 'ADMIN' ? '#E5FFF5' : palette.secondary, fontSize: 10, marginTop: 4 }}>{item.senderName} · {new Date(item.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</ThemedText> : null}</View>)}</View>
        {customerTyping ? <ThemedText themeColor="textSecondary" style={styles.note}>{customerTyping}</ThemedText> : null}{renderError(accept.error)}{renderError(send.error)}
        {button(accept.isPending ? 'Đang nhận...' : 'Nhận xử lý', () => accept.mutate(selectedChat))}
        <View style={styles.composer}><TextInput value={message} onChangeText={handleInboxDraftChange} onBlur={stopInboxTyping} multiline maxLength={2000} placeholder="Trả lời khách hàng..." placeholderTextColor={palette.secondary} style={[styles.input, styles.messageInput, { color: palette.foreground, borderColor: palette.selected }]} /><Pressable disabled={!message.trim() || send.isPending} onPress={() => { stopInboxTyping(); send.mutate({ id: selectedChat, content: message.trim() }); }} style={[styles.sendButton, { backgroundColor: palette.accent, opacity: message.trim() ? 1 : 0.5 }]}><ThemedText style={styles.buttonText}>Gửi</ThemedText></Pressable></View>
        <View style={styles.inlineButtons}>{smallButton('Đề nghị kết thúc', () => close.mutate(selectedChat))}{smallButton('Lưu trữ', () => confirm('Lưu trữ hội thoại?', 'Hội thoại sẽ được archive.', () => archive.mutate(selectedChat)), true)}{smallButton('Mở lại', () => reopen.mutate(selectedChat))}</View>
        <ThemedText themeColor="textSecondary" style={styles.note}>Tin nhắn mới cập nhật realtime qua Socket.IO; nội dung cũ được tải lại định kỳ.</ThemedText>
      </>}</View> : null}

    {section === 'medicines' ? <View style={styles.sectionWrap}><View style={styles.heading}><ThemedText style={styles.sectionTitle}>Sản phẩm</ThemedText><View style={styles.categoryActions}>{button('Import JSON', () => { if (!pendingProductBatch.current) setMedicineImportJson(''); setMedicineImportVisible(true); }, true)}{button('+ Thêm', () => openMedicine())}</View></View>
      {renderError(medicineCategories.error)}
      <TextInput value={search} onChangeText={(value) => { setSearch(value); setListPage(1); }} placeholder="Tìm tên sản phẩm" placeholderTextColor={palette.secondary} style={[styles.input, { color: palette.foreground, borderColor: palette.selected }]} />{renderLoading(medicines)}{renderError(medicines.error)}{medicines.data?.data.map((item) => row(item.name, `${item.category} · ${item.price == null ? 'Cần dược sĩ tư vấn' : `${Number(item.price).toLocaleString('vi-VN')} ₫`} · Tồn ${item.stockQuantity}`, <>{smallButton('Sửa', () => openMedicine(item))}{smallButton('Xóa', () => confirm('Xóa sản phẩm?', item.name, () => removeMedicine.mutate(item.id)), true)}</>))}{pageControls(medicines.data?.pagination)}</View> : null}

    {section === 'categories' ? <View style={styles.sectionWrap}><View style={styles.heading}><ThemedText style={styles.sectionTitle}>Danh mục sản phẩm</ThemedText><View style={styles.categoryActions}>{button('Import JSON', () => { if (!pendingCategoryBatch.current) setCategoryImportJson(''); setCategoryImportVisible(true); }, true)}{button('+ Thêm', () => openCategory())}</View></View>{renderLoading(categories)}{renderError(categories.error)}{renderError(saveCategory.error)}{renderError(updateCategory.error)}{renderError(deactivateCategory.error)}{categories.data?.length ? renderCategoryBranch(null) : null}</View> : null}

    {section === 'coupons' ? <View style={styles.sectionWrap}><View style={styles.heading}><ThemedText style={styles.sectionTitle}>Mã giảm giá</ThemedText>{button('+ Tạo mã', () => openCoupon())}</View>{renderLoading(coupons)}{renderError(coupons.error)}{coupons.data?.map((item) => row(item.code, `${item.discountType === 'PERCENTAGE' ? `${item.discountValue}%` : `${Number(item.discountValue).toLocaleString('vi-VN')} ₫`} · ${item.isActive ? 'Đang bật' : 'Đã tắt'} · HSD ${new Date(item.expiresAt).toLocaleDateString('vi-VN')}`, <>{smallButton('Sửa', () => openCoupon(item))}{item.isActive ? smallButton('Tắt', () => confirm('Vô hiệu hóa mã?', item.code, () => disableCoupon.mutate(item.id)), true) : null}</>))}</View> : null}

    {section === 'orders' ? <View style={styles.sectionWrap}><ThemedText style={styles.sectionTitle}>Quản lý đơn hàng</ThemedText>{renderLoading(orders)}{renderError(orders.error)}{renderError(orderUpdate.error)}{orders.data?.data.map((item) => row(`#${item.id.slice(-8)} · ${item.user?.fullName ?? 'Khách hàng'}`, `${item.status} · Thanh toán: ${item.paymentStatus} · ${Number(item.totalAmount).toLocaleString('vi-VN')} ₫ · ${new Date(item.createdAt).toLocaleDateString('vi-VN')}`, <View style={styles.statusActions}>{statuses.filter((status) => status !== item.status).map((status) => smallButton(status, () => confirm('Cập nhật trạng thái?', `${item.status} → ${status}`, () => orderUpdate.mutate({ id: item.id, status })), false, status))}{item.paymentStatus !== 'PAID' ? smallButton('Đã thanh toán', () => confirm('Cập nhật thanh toán?', 'Đánh dấu đơn đã thanh toán?', () => orderUpdate.mutate({ id: item.id, status: item.status, paymentStatus: 'PAID' }))) : null}</View>))}{pageControls(orders.data?.pagination)}</View> : null}

    {section === 'users' ? <View style={styles.sectionWrap}><ThemedText style={styles.sectionTitle}>Người dùng</ThemedText><TextInput value={search} onChangeText={(value) => { setSearch(value); setListPage(1); }} placeholder="Tìm tên, email hoặc số điện thoại" placeholderTextColor={palette.secondary} style={[styles.input, { color: palette.foreground, borderColor: palette.selected }]} />{renderLoading(users)}{renderError(users.error)}{users.data?.data.map((item) => row(item.fullName, `${item.email ?? item.phone} · ${item.role} · ${item.isActive ? 'Đang hoạt động' : 'Đã khóa'}`, <View style={styles.statusActions}>{item.id !== user?.id ? <>{(['CUSTOMER', 'PHARMACIST', 'ADMIN'] as const).filter((role) => role !== item.role).map((role) => smallButton(role, () => confirm('Đổi quyền người dùng?', `Đặt vai trò ${role} cho ${item.fullName}?`, () => userUpdate.mutate({ id: item.id, role })), false, role))}{smallButton(item.isActive ? 'Khóa' : 'Mở khóa', () => confirm(item.isActive ? 'Khóa tài khoản?' : 'Mở tài khoản?', item.fullName, () => userUpdate.mutate({ id: item.id, isActive: !item.isActive })), item.isActive)}</> : <ThemedText themeColor="textSecondary">Tài khoản hiện tại</ThemedText>}</View>))}{pageControls(users.data?.pagination)}</View> : null}
  </ScrollView></SafeAreaView>

  <Modal visible={menuVisible} transparent animationType="none" statusBarTranslucent onRequestClose={closeMenu}>
    <View style={styles.menuLayer}>
      <Animated.View pointerEvents="none" style={[styles.menuBackdrop, { opacity: menuBackdropOpacity }]} />
      <Pressable accessibilityRole="button" accessibilityLabel="Đóng menu quản trị" onPress={closeMenu} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.menuDrawer, { backgroundColor: theme.background, transform: [{ translateX: menuTranslateX }] }]}>
        <SafeAreaView style={styles.menuSafe} edges={['top', 'bottom']}>
          <View style={[styles.menuHeader, { borderBottomColor: palette.selected }]}>
            <View style={styles.menuHeaderCopy}>
              <ThemedText style={styles.menuTitle}>PharmaShop</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.menuSubtitle}>Khu vực quản trị</ThemedText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng menu" onPress={closeMenu} style={[styles.menuClose, { backgroundColor: palette.surface }]}>
              <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={17} tintColor={palette.foreground} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.menuList}>
            {menuItems.map((item) => {
              const active = item.id === section;
              return <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => selectMenuItem(item.id)} style={[styles.menuItem, { backgroundColor: active ? palette.selected : 'transparent' }]}>
                <SymbolView name={menuIcons[item.id]} size={20} tintColor={active ? palette.accent : palette.secondary} />
                <ThemedText style={[styles.menuItemLabel, { color: active ? palette.accent : palette.foreground }]}>{item.label}</ThemedText>
                {active ? <View style={[styles.menuItemMarker, { backgroundColor: palette.accent }]} /> : null}
              </Pressable>;
            })}
          </ScrollView>
          <ThemedText themeColor="textSecondary" style={styles.menuFooter}>Đăng nhập với {user?.fullName}</ThemedText>
        </SafeAreaView>
      </Animated.View>
    </View>
  </Modal>

  <Modal visible={formVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFormVisible(false)}><ThemedView style={styles.modal}><SafeAreaView style={{ flex: 1 }}><ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled"><View style={styles.heading}><ThemedText style={styles.sectionTitle}>{section === 'categories' ? editingId ? 'Sửa danh mục' : 'Thêm danh mục' : section === 'medicines' ? editingId ? 'Sửa sản phẩm' : 'Thêm sản phẩm' : editingId ? 'Sửa mã giảm giá' : 'Tạo mã giảm giá'}</ThemedText><Pressable onPress={() => setFormVisible(false)}><ThemedText style={{ color: palette.accent }}>Đóng</ThemedText></Pressable></View>
    {section === 'categories' ? <>{field('Tên danh mục', categoryForm.name, (value) => setCategoryForm({ ...categoryForm, name: value }))}{field('URL hình ảnh HTTPS (tùy chọn)', categoryForm.imageUrl, (value) => setCategoryForm({ ...categoryForm, imageUrl: value }))}<ThemedText style={styles.fieldLabel}>Danh mục cha</ThemedText><View style={styles.inlineButtons}>{smallButton(categoryForm.parentId ? 'Danh mục gốc' : '✓ Danh mục gốc', () => setCategoryForm({ ...categoryForm, parentId: '' }))}{(categories.data ?? []).filter((candidate) => candidate.isActive && candidate.id !== editingId && !findDescendants(categories.data ?? [], editingId ?? '').has(candidate.id)).map((candidate) => smallButton(`${categoryForm.parentId === candidate.id ? '✓ ' : ''}${candidate.name}`, () => setCategoryForm({ ...categoryForm, parentId: candidate.id }), false, candidate.id))}</View>{button(saveCategory.isPending ? 'Đang lưu...' : 'Lưu danh mục', () => saveCategory.mutate())}{renderError(saveCategory.error)}</> : section === 'medicines' ? <>{field('Tên sản phẩm', medicineForm.name, (v) => setMedicineForm({ ...medicineForm, name: v }))}{field('Hoạt chất', medicineForm.activeIngredient, (v) => setMedicineForm({ ...medicineForm, activeIngredient: v }))}<ThemedText style={styles.fieldLabel}>Danh mục lá đang hoạt động</ThemedText><View style={styles.inlineButtons}>{activeLeafCategories.map((candidate) => smallButton(`${medicineForm.category === candidate.name ? '✓ ' : ''}${candidate.name}`, () => setMedicineForm({ ...medicineForm, category: candidate.name }), false, candidate.id))}</View>{!activeLeafCategories.length ? <ThemedText themeColor="textSecondary">Chưa có danh mục lá hoạt động.</ThemedText> : null}{field('Giá (VND)', medicineForm.price, (v) => setMedicineForm({ ...medicineForm, price: v }), true)}{field('Tồn kho', medicineForm.stockQuantity, (v) => setMedicineForm({ ...medicineForm, stockQuantity: v }), true)}{field('Quy cách đóng gói', medicineForm.packaging, (v) => setMedicineForm({ ...medicineForm, packaging: v }))}{field('Đơn vị', medicineForm.unit, (v) => setMedicineForm({ ...medicineForm, unit: v }))}{field('URL hình ảnh', medicineForm.imageUrl, (v) => setMedicineForm({ ...medicineForm, imageUrl: v }))}{button(saveMedicine.isPending ? 'Đang lưu...' : 'Lưu sản phẩm', () => saveMedicine.mutate())}{renderError(saveMedicine.error)}</> : <>{field('Mã coupon', couponForm.code, (v) => { setCouponForm({ ...couponForm, code: v }); setCouponFormError(''); })}<ThemedText style={styles.fieldLabel}>Loại giảm giá</ThemedText>{discountTypeSelector}{field(couponForm.discountType === 'PERCENTAGE' ? 'Phần trăm giảm (%)' : 'Số tiền giảm (₫)', couponForm.discountValue, (v) => { setCouponForm({ ...couponForm, discountValue: v }); setCouponFormError(''); }, true)}{field('Đơn tối thiểu (₫)', couponForm.minOrderAmount, (v) => { setCouponForm({ ...couponForm, minOrderAmount: v }); setCouponFormError(''); }, true)}{couponForm.discountType === 'PERCENTAGE' ? field('Giảm tối đa (₫, tùy chọn)', couponForm.maxDiscount, (v) => { setCouponForm({ ...couponForm, maxDiscount: v }); setCouponFormError(''); }, true) : null}{field('Hạn dùng đến (YYYY-MM-DD)', couponForm.expiresAt, (v) => { setCouponForm({ ...couponForm, expiresAt: v }); setCouponFormError(''); })}{field('Số lượt sử dụng (tùy chọn)', couponForm.usageLimit, (v) => { setCouponForm({ ...couponForm, usageLimit: v }); setCouponFormError(''); }, true)}{couponFormError ? <ThemedText accessibilityRole="alert" style={styles.error}>{couponFormError}</ThemedText> : null}{saveCoupon.error ? <ThemedText accessibilityRole="alert" style={styles.error}>{saveCoupon.error instanceof ApiError ? saveCoupon.error.message : 'Không tạo được mã giảm giá. Kiểm tra thông tin rồi thử lại.'}</ThemedText> : null}{button(saveCoupon.isPending ? 'Đang lưu...' : 'Lưu mã giảm giá', submitCoupon, false, saveCoupon.isPending)}</>}</ScrollView></SafeAreaView></ThemedView></Modal>

  <Modal visible={categoryImportVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!categoryImportBusy) setCategoryImportVisible(false); }}>
    <ThemedView style={styles.modal}><SafeAreaView style={{ flex: 1 }}><ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
      <View style={styles.heading}><ThemedText style={styles.sectionTitle}>Import danh mục JSON</ThemedText><Pressable disabled={categoryImportBusy} onPress={() => setCategoryImportVisible(false)}><ThemedText style={{ color: palette.accent }}>Đóng</ThemedText></Pressable></View>
      <ThemedText themeColor="textSecondary" style={styles.note}>Dán mảng JSON gồm name và imageUrl HTTPS. Tối đa 100 danh mục mỗi lần.</ThemedText>
      <TextInput value={categoryImportJson} onChangeText={setCategoryImportJson} multiline scrollEnabled autoCapitalize="none" editable={!categoryImportBusy && !pendingCategoryBatch.current} placeholder='[{"name":"Thuốc cảm lạnh, ho","imageUrl":"https://.../category.png"}]' placeholderTextColor={palette.secondary} style={[styles.input, styles.jsonInput, { color: palette.foreground, borderColor: palette.selected }]} />
      {button('Định dạng JSON', formatCategoryImportJson, true, categoryImportBusy || !!pendingCategoryBatch.current)}
      <ThemedText themeColor="textSecondary" style={styles.note}>Xem trước: {categoryPreviewRows.length} · hợp lệ {categoryPreviewRows.length - categoryPreviewInvalidCount} · lỗi {categoryPreviewInvalidCount} · tên sẽ gộp {duplicateCategoryCount}. Sửa JSON ở ô phía trên trước khi import.</ThemedText>
      {categoryPreviewRows.slice(0, 12).map((raw, index) => { const item = raw as Record<string, unknown>; return <ThemedText key={`${index}-${String(item?.name)}`} style={styles.previewRow}>{index + 1}. {String(item?.name ?? 'Tên thiếu')} · {String(item?.imageUrl ?? 'Không đổi ảnh')}</ThemedText>; })}
      {button(categoryImportBusy ? 'Đang import...' : pendingCategoryBatch.current ? 'Thử lại cùng dữ liệu' : 'Import danh mục', importCategories, false, categoryImportBusy)}
    </ScrollView></SafeAreaView></ThemedView>
  </Modal>

  <Modal visible={medicineImportVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!medicineImportBusy) setMedicineImportVisible(false); }}>
    <ThemedView style={styles.modal}><SafeAreaView style={{ flex: 1 }}><ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
      <View style={styles.heading}><ThemedText style={styles.sectionTitle}>Import sản phẩm JSON</ThemedText><Pressable disabled={medicineImportBusy} onPress={() => setMedicineImportVisible(false)}><ThemedText style={{ color: palette.accent }}>Đóng</ThemedText></Pressable></View>
      <ThemedText themeColor="textSecondary" style={styles.note}>Dán JSON xuất từ công cụ HTML. Danh mục phải đang hoạt động: {(medicineCategories.data ?? []).filter((item) => item.isActive).map((item) => item.name).join(', ') || 'đang tải...'}. Tồn kho mặc định là 100.</ThemedText>
      <TextInput value={medicineImportJson} onChangeText={setMedicineImportJson} multiline scrollEnabled autoCapitalize="none" editable={!medicineImportBusy && !pendingProductBatch.current} placeholder='[{"name":"...","category":"...","price":153000,"stockQuantity":100,"unit":"Hộp","imageUrl":"https://..."}]' placeholderTextColor={palette.secondary} style={[styles.input, styles.jsonInput, { color: palette.foreground, borderColor: palette.selected }]} />
      {button('Định dạng JSON', formatMedicineImportJson, true, medicineImportBusy || !!pendingProductBatch.current)}
      <ThemedText themeColor="textSecondary" style={styles.note}>Ô nhập có chiều cao cố định, có thể cuộn và không giới hạn độ dài. Sau khi dán xong, nhấn “Định dạng JSON” để cập nhật xem trước. Import sẽ dùng toàn bộ nội dung trong ô.</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.note}>Xem trước {productPreviewRows.length} · hợp lệ {productPreviewRows.length - productPreviewInvalidCount} · lỗi {productPreviewInvalidCount} (tối đa 100 mỗi batch).</ThemedText>
      {productPreviewRows.slice(0, 12).map((raw, index) => { const item = raw as Record<string, unknown>; return <ThemedText key={`${index}-${String(item?.name)}`} style={styles.previewRow}>{index + 1}. {String(item?.name ?? 'Tên thiếu')} · {String(item?.category ?? 'Thiếu danh mục')} · {String(item?.price ?? 'Thiếu giá')} · tồn {String(item?.stockQuantity ?? 'thiếu')} · {String(item?.unit ?? 'thiếu đơn vị')}</ThemedText>; })}
      {renderError(medicineCategories.error)}
      {button(medicineImportBusy ? 'Đang nhập sản phẩm...' : 'Nhập JSON vào database', importMedicinesFromJson, false, medicineImportBusy || medicineCategories.isLoading)}
    </ScrollView></SafeAreaView></ThemedView>
  </Modal>
  </ThemedView>;

  function formatCategoryImportJson() { try { const parsed: unknown = JSON.parse(categoryImportJson); const rows = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' && Array.isArray((parsed as { categories?: unknown }).categories) ? (parsed as { categories: unknown[] }).categories : null; if (!rows) throw new Error('JSON cần là mảng hoặc object có categories[].'); const normalized = rows.map((raw) => { const item = raw as Record<string, unknown>; return { name: typeof item?.name === 'string' ? item.name.trim() : item?.name, ...(typeof item?.imageUrl === 'string' ? { imageUrl: normalizeImportUrl(item.imageUrl) } : {}), ...(typeof item?.parentId === 'string' && item.parentId.trim() ? { parentId: item.parentId.trim() } : {}) }; }); setCategoryImportJson(JSON.stringify(Array.isArray(parsed) ? normalized : { ...(parsed as Record<string, unknown>), categories: normalized }, null, 2)); } catch (error) { Alert.alert('Không thể định dạng JSON', error instanceof Error ? error.message : 'JSON không hợp lệ.'); } }
  function formatMedicineImportJson() { try { const parsed: unknown = JSON.parse(medicineImportJson); const rows = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' && Array.isArray((parsed as { products?: unknown }).products) ? (parsed as { products: unknown[] }).products : null; if (!rows) throw new Error('JSON cần là mảng hoặc object có products[].'); const normalized = rows.map((raw) => { const item = raw as Record<string, unknown>; return { ...item, ...(typeof item?.name === 'string' ? { name: item.name.trim() } : {}), ...(typeof item?.category === 'string' ? { category: item.category.trim() } : {}), ...(typeof item?.unit === 'string' ? { unit: item.unit.trim() } : {}), ...(typeof item?.imageUrl === 'string' ? { imageUrl: normalizeImportUrl(item.imageUrl) } : {}) }; }); const formatted = JSON.stringify(Array.isArray(parsed) ? normalized : { ...(parsed as Record<string, unknown>), products: normalized }, null, 2); setMedicineImportJson(formatted); setMedicineImportPreviewJson(formatted); } catch (error) { Alert.alert('Không thể định dạng JSON', error instanceof Error ? error.message : 'JSON không hợp lệ.'); } }
  function field(label: string, value: string, onChangeText: (value: string) => void, numeric = false) { return <View style={{ marginTop: 14 }}><ThemedText style={styles.fieldLabel}>{label}</ThemedText><TextInput value={value} onChangeText={onChangeText} keyboardType={numeric ? 'numeric' : 'default'} placeholder={label} placeholderTextColor={palette.secondary} style={[styles.input, { color: palette.foreground, borderColor: palette.selected }]} /></View>; }
  function pageControls(pagination?: AdminApi.Page<unknown>['pagination']) { if (!pagination || pagination.totalPages <= 1) return null; return <View style={styles.pageControls}><Pressable disabled={listPage <= 1} onPress={() => setListPage((page) => Math.max(1, page - 1))}><ThemedText style={{ color: listPage <= 1 ? palette.secondary : palette.accent }}>‹ Trước</ThemedText></Pressable><ThemedText themeColor="textSecondary">Trang {pagination.page} / {pagination.totalPages} · {pagination.total} mục</ThemedText><Pressable disabled={listPage >= pagination.totalPages} onPress={() => setListPage((page) => Math.min(pagination.totalPages, page + 1))}><ThemedText style={{ color: listPage >= pagination.totalPages ? palette.secondary : palette.accent }}>Tiếp ›</ThemedText></Pressable></View>; }
}

async function importCategoriesInBatches(items: AdminApi.MedicineCategoryImportItem[]): Promise<AdminApi.MedicineCategoryImportResult> {
  const results: AdminApi.MedicineCategoryImportResult['results'] = [];
  let created = 0;
  let updated = 0;
  let failed = 0;
  for (let offset = 0; offset < items.length; offset += 100) {
    const report = await AdminApi.importMedicineCategories(items.slice(offset, offset + 100));
    created += report.created;
    updated += report.updated;
    failed += report.failed;
    results.push(...report.results.map((result) => ({ ...result, index: result.index + offset })));
  }
  return { total: items.length, created, updated, failed, results };
}

const styles = StyleSheet.create({
  page: { flex: 1 }, safe: { flex: 1 }, content: { padding: 18, paddingBottom: 44 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 26, fontWeight: '800' }, subtitle: { marginTop: 4, marginBottom: 16 },
  adminBar: { minHeight: 72, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth }, menuButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, homeButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, adminBarCopy: { flex: 1, minWidth: 0 }, adminBarTitle: { fontSize: 17, fontWeight: '800' }, adminBarSubtitle: { fontSize: 11, marginTop: 3 },
  menuLayer: { flex: 1, flexDirection: 'row' }, menuBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0, 0, 0, 0.42)' }, menuDrawer: { width: '84%', maxWidth: 340, height: '100%', paddingHorizontal: 18 }, menuSafe: { flex: 1 }, menuHeader: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 12 }, menuHeaderCopy: { flex: 1 }, menuTitle: { fontSize: 21, fontWeight: '800' }, menuSubtitle: { fontSize: 12, marginTop: 3 }, menuClose: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, menuList: { gap: 5, paddingVertical: 4 }, menuItem: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 13, borderRadius: 13 }, menuItemLabel: { flex: 1, fontSize: 14, fontWeight: '700' }, menuItemMarker: { width: 7, height: 7, borderRadius: 4 }, menuFooter: { paddingVertical: 15, fontSize: 11 },
  overview: { marginTop: 12 }, sectionTitle: { fontSize: 19, fontWeight: '800' }, overviewRow: { paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between' },
  sectionWrap: { marginTop: 16 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }, categoryActions: { flexDirection: 'row', gap: 8 }, button: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }, buttonText: { color: '#fff', fontWeight: '700' },
  row: { paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, alignItems: 'center' }, rowBody: { flex: 1 }, rowTitle: { fontSize: 14, fontWeight: '700' }, rowDetail: { fontSize: 12, lineHeight: 18, marginTop: 4 }, rowActions: { maxWidth: '45%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 5 },
  pageControls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 },
  smallButton: { paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1, borderRadius: 8, alignSelf: 'flex-start' }, discountTypePicker: { flexDirection: 'row', gap: 6, padding: 5, marginTop: 8, borderRadius: 12 }, discountTypeOption: { flex: 1, minHeight: 56, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingVertical: 7 }, discountTypeLabel: { fontSize: 13, fontWeight: '700' }, discountTypeHint: { fontSize: 10, marginTop: 2 }, statusActions: { maxWidth: 160, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, marginTop: 8 }, jsonInput: { height: 180, maxHeight: 180, flexGrow: 0, flexShrink: 0, paddingTop: 12, textAlignVertical: 'top', fontFamily: 'monospace' }, fieldLabel: { fontSize: 13, fontWeight: '700' }, modal: { flex: 1 }, modalContent: { padding: 20, paddingBottom: 40 }, previewRow: { fontSize: 12, lineHeight: 18, paddingVertical: 4 },
  chatRow: { minHeight: 78, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 }, chatAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, filterRow: { gap: 8, paddingVertical: 12 }, filter: { borderRadius: 9, padding: 9 }, thread: { minHeight: 240, maxHeight: 460, borderRadius: 14, padding: 10, gap: 8, marginVertical: 12 }, bubble: { maxWidth: '88%', padding: 11, borderRadius: 14 }, productEmbed: { minWidth: 190, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 10, marginTop: 7, backgroundColor: 'rgba(255,255,255,0.18)' }, composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 }, messageInput: { flex: 1, minHeight: 44, maxHeight: 110, marginTop: 0 }, sendButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, inlineButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }, note: { fontSize: 12, lineHeight: 18, marginTop: 14 }, error: { color: '#B42318', paddingVertical: 12 },
});

type MedicineImportRecord = AdminApi.MedicineImportItem;
function readImportRows(raw: string, key: 'products' | 'categories'): unknown[] {
  try { const parsed: unknown = JSON.parse(raw); if (Array.isArray(parsed)) return parsed; if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>)[key])) return (parsed as Record<string, unknown[]>)[key]; } catch { /* keep preview empty while JSON is being edited */ }
  return [];
}
function readCombinedImportRows(raw: string, key: 'products' | 'categories'): unknown[] {
  try { const parsed: unknown = JSON.parse(raw); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray((parsed as Record<string, unknown>)[key])) return (parsed as Record<string, unknown[]>)[key]; } catch { /* input is still being edited */ }
  return [];
}
function normalizeMedicineImportItem(value: unknown): MedicineImportRecord | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  return {
    name: typeof item.name === 'string' ? item.name.trim() : '', category: typeof item.category === 'string' ? item.category.trim() : '',
    price: item.price === null ? null : typeof item.price === 'number' ? item.price : Number.NaN, stockQuantity: typeof item.stockQuantity === 'number' ? item.stockQuantity : Number.NaN,
    unit: typeof item.unit === 'string' ? item.unit.trim() : '',
    ...(typeof item.imageUrl === 'string' && item.imageUrl.trim() ? { imageUrl: item.imageUrl.trim() } : {}),
    ...(typeof item.categoryId === 'string' && item.categoryId.trim() ? { categoryId: item.categoryId.trim() } : {}),
    ...(typeof item.activeIngredient === 'string' && item.activeIngredient.trim() ? { activeIngredient: item.activeIngredient.trim() } : {}),
    ...(typeof item.packaging === 'string' && item.packaging.trim() ? { packaging: item.packaging.trim() } : {}),
    ...(typeof item.barcode === 'string' && item.barcode.trim() ? { barcode: item.barcode.trim() } : {}),
  };
}
function createImportKey() { return `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`; }
function isMedicineImportRecord(value: unknown, categories: Set<string>): value is MedicineImportRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 200
    && typeof item.category === 'string' && item.category.length <= 100 && categories.has(item.category)
    && (item.categoryId === undefined || (typeof item.categoryId === 'string' && item.categoryId.length > 0))
    && (item.price === null || (typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0
      && Math.abs(item.price * 100 - Math.round(item.price * 100)) <= 1e-7))
    && typeof item.stockQuantity === 'number' && Number.isInteger(item.stockQuantity) && item.stockQuantity >= 0
    && typeof item.unit === 'string' && item.unit.trim().length > 0 && item.unit.length <= 40
    && (item.imageUrl === undefined || (typeof item.imageUrl === 'string' && isHttpsUrl(item.imageUrl, 2048)))
    && (item.activeIngredient === undefined || (typeof item.activeIngredient === 'string' && item.activeIngredient.length <= 300))
    && (item.packaging === undefined || (typeof item.packaging === 'string' && item.packaging.length <= 200))
    && (item.barcode === undefined || (typeof item.barcode === 'string' && item.barcode.length <= 100));
}

function isCategoryImportRecord(value: unknown): value is AdminApi.MedicineCategoryImportItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 100) return false;
  if (item.parentId !== undefined && item.parentId !== null && (typeof item.parentId !== 'string' || !item.parentId.trim())) return false;
  if (item.imageUrl === undefined || item.imageUrl === null || item.imageUrl === '') return true;
  return typeof item.imageUrl === 'string' && item.imageUrl.length <= 2048 && isHttpsUrl(item.imageUrl, 2048);
}
function findDescendants(categories: AdminApi.AdminMedicineCategory[], rootId: string): Set<string> {
  const result = new Set<string>(); const pending = [rootId];
  while (pending.length) { const parentId = pending.pop()!; for (const child of categories.filter((item) => item.parentId === parentId)) { if (result.has(child.id)) continue; result.add(child.id); pending.push(child.id); } }
  result.delete(rootId); return result;
}
function normalizeImportUrl(value: string) { const trimmed = value.trim(); try { return new URL(trimmed).toString(); } catch { return trimmed; } }
function isHttpsUrl(value: string, maxLength: number) { if (value.length > maxLength) return false; try { const url = new URL(value); return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password; } catch { return false; } }
function validateCouponForm(form: typeof emptyCoupon): string | null {
  if (!form.code.trim()) return 'Nhập mã giảm giá trước khi lưu.';
  if (form.code.trim().length > 50) return 'Mã giảm giá không được dài quá 50 ký tự.';
  const discount = Number(form.discountValue);
  if (!Number.isFinite(discount) || discount <= 0) return 'Giá trị giảm phải là số lớn hơn 0.';
  if (form.discountType === 'PERCENTAGE' && discount > 100) return 'Phần trăm giảm không được vượt quá 100%.';
  const minimum = Number(form.minOrderAmount || 0);
  if (!Number.isFinite(minimum) || minimum < 0) return 'Đơn tối thiểu phải là số không âm.';
  if (form.maxDiscount) { const maximumDiscount = Number(form.maxDiscount); if (!Number.isFinite(maximumDiscount) || maximumDiscount <= 0) return 'Mức giảm tối đa phải lớn hơn 0.'; }
  if (!isValidCouponDate(form.expiresAt)) return 'Nhập hạn dùng hợp lệ theo định dạng YYYY-MM-DD.';
  if (form.usageLimit) { const limit = Number(form.usageLimit); if (!Number.isInteger(limit) || limit < 1) return 'Số lượt sử dụng phải là số nguyên lớn hơn 0.'; }
  return null;
}
function isValidCouponDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

import { Link, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { AppHeader } from '@/components/app-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/features/auth/auth-provider';
import { cancelOrder, createPayOSLink, getOrderById } from '@/features/orders/api/orders';
import { ApiError } from '@/shared/api/client';

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const orderLabels: Record<string, string> = { PENDING: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', SHIPPING: 'Đang giao', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy' };
const paymentLabels: Record<string, string> = { PENDING: 'Chưa thanh toán', PAID: 'Đã thanh toán', FAILED: 'Thanh toán thất bại', REFUNDED: 'Đã hoàn tiền' };

export default function OrderDetailScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { id: orderId } = useLocalSearchParams<{ id: string }>();
  const [actionError, setActionError] = useState('');
  const detail = useQuery({ queryKey: ['orders', 'detail', orderId], queryFn: () => getOrderById(orderId), enabled: !!user && !!orderId });
  useFocusEffect(useCallback(() => { if (detail.data) void detail.refetch(); }, [detail.refetch]));
  const cancel = useMutation({ mutationFn: () => cancelOrder(orderId), onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['orders', 'detail', orderId] }), queryClient.invalidateQueries({ queryKey: ['orders', 'my'] })]); }, onError: (error) => setActionError(error instanceof ApiError ? error.message : 'Không hủy được đơn hàng.') });
  const pay = async () => {
    if (!detail.data) return;
    setActionError('');
    try {
      const result = await createPayOSLink(orderId);
      const checkout = new URL(result.checkoutUrl);
      if (checkout.protocol !== 'https:' || !(checkout.hostname === 'pay.payos.vn' || checkout.hostname.endsWith('.payos.vn'))) throw new Error('Đường dẫn thanh toán không hợp lệ.');
      await WebBrowser.openBrowserAsync(checkout.toString());
      await detail.refetch();
      await queryClient.invalidateQueries({ queryKey: ['orders', 'my'] });
    } catch (error) { setActionError(error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Không mở được PayOS.'); }
  };
  const order = detail.data;
  const canCancel = order?.status === 'PENDING' && order.paymentStatus !== 'PAID';
  const canPay = order?.paymentMethod === 'PAYOS' && order.paymentStatus !== 'PAID' && order.status !== 'CANCELLED';
  const confirmCancel = () => Alert.alert('Hủy đơn hàng?', 'Đơn hàng đang chờ xử lý sẽ được hủy.', [{ text: 'Để sau', style: 'cancel' }, { text: 'Hủy đơn', style: 'destructive', onPress: () => cancel.mutate() }]);

  return <ThemedView style={styles.page}><SafeAreaView style={styles.safe} edges={['top', 'bottom']}><AppHeader /><ScrollView contentContainerStyle={styles.content}>
    <ThemedText style={styles.title}>Chi tiết đơn hàng</ThemedText>
    {!user ? <View style={styles.notice}><ThemedText>Đăng nhập để xem đơn hàng.</ThemedText><Link href="/auth/login" style={{ color: theme.tint, marginTop: 10 }}>Đăng nhập</Link></View> : detail.isLoading ? <ActivityIndicator color={theme.tint} /> : detail.error ? <View style={styles.notice}><ThemedText style={styles.error}>{detail.error instanceof ApiError ? detail.error.message : 'Không tải được đơn hàng.'}</ThemedText><Pressable onPress={() => void detail.refetch()}><ThemedText style={{ color: theme.tint, marginTop: 10 }}>Thử lại</ThemedText></Pressable></View> : order ? <>
      <View style={styles.summary}><View style={styles.row}><ThemedText style={styles.code}>#{order.id.slice(-8).toUpperCase()}</ThemedText><ThemedText style={[styles.status, { color: theme.tint }]}>{orderLabels[order.status] ?? order.status}</ThemedText></View><ThemedText themeColor="textSecondary" style={styles.meta}>{new Date(order.createdAt).toLocaleString('vi-VN')}</ThemedText><ThemedText themeColor="textSecondary" style={styles.meta}>{order.paymentMethod} · {paymentLabels[order.paymentStatus] ?? order.paymentStatus}</ThemedText></View>
      <ThemedText style={styles.section}>Sản phẩm</ThemedText>
      {order.items.map((item) => <View key={item.id} style={[styles.item, { borderBottomColor: theme.backgroundElement }]}><View style={styles.itemTitle}><ThemedText style={styles.itemName}>{item.medicine?.name ?? `Sản phẩm ${item.medicineId}`}</ThemedText><ThemedText themeColor="textSecondary">× {item.quantity}</ThemedText></View><ThemedText themeColor="textSecondary" style={styles.meta}>{money.format(Number(item.unitPrice))} / sản phẩm</ThemedText></View>)}
      <ThemedText style={styles.section}>Giao hàng</ThemedText><View style={styles.block}><ThemedText style={styles.itemName}>{order.receiverName ?? 'Người nhận'}</ThemedText>{order.receiverPhone ? <ThemedText themeColor="textSecondary" style={styles.meta}>{order.receiverPhone}</ThemedText> : null}<ThemedText themeColor="textSecondary" style={styles.meta}>{order.shippingAddress ?? 'Chưa có địa chỉ'}</ThemedText></View>
      <ThemedText style={styles.section}>Thanh toán</ThemedText><View style={styles.block}>{order.subtotalAmount !== undefined ? <View style={styles.row}><ThemedText themeColor="textSecondary">Tạm tính</ThemedText><ThemedText>{money.format(Number(order.subtotalAmount))}</ThemedText></View> : null}{Number(order.discountAmount ?? 0) > 0 ? <View style={styles.row}><ThemedText themeColor="textSecondary">Giảm giá{order.couponCode ? ` (${order.couponCode})` : ''}</ThemedText><ThemedText>{money.format(Number(order.discountAmount))}</ThemedText></View> : null}<View style={[styles.row, styles.totalRow]}><ThemedText style={styles.itemName}>Tổng cộng</ThemedText><ThemedText style={[styles.total, { color: theme.tint }]}>{money.format(Number(order.totalAmount))}</ThemedText></View></View>
      {actionError ? <ThemedText accessibilityRole="alert" style={styles.error}>{actionError}</ThemedText> : null}
      {canPay ? <Pressable accessibilityRole="button" onPress={() => void pay()} style={[styles.primary, { backgroundColor: theme.tint }]}><ThemedText style={styles.primaryText}>Tiếp tục thanh toán PayOS</ThemedText></Pressable> : null}
      {canCancel ? <Pressable accessibilityRole="button" disabled={cancel.isPending} onPress={confirmCancel} style={[styles.cancel, { borderColor: theme.backgroundSelected }]}>{cancel.isPending ? <ActivityIndicator color={theme.tint} /> : <ThemedText style={styles.cancelText}>Hủy đơn hàng</ThemedText>}</Pressable> : null}
    </> : null}
  </ScrollView></SafeAreaView></ThemedView>;
}

const styles = StyleSheet.create({ page: { flex: 1 }, safe: { flex: 1 }, content: { padding: 20, paddingBottom: 30 }, title: { fontSize: 26, fontWeight: '800', marginBottom: 18 }, summary: { paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#DDE5E2' }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, code: { fontWeight: '700' }, status: { fontWeight: '700', fontSize: 13 }, meta: { fontSize: 13, lineHeight: 19, marginTop: 5 }, section: { fontSize: 17, fontWeight: '700', marginTop: 22, marginBottom: 9 }, item: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth }, itemTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }, itemName: { flex: 1, fontWeight: '600' }, block: { gap: 7 }, totalRow: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#DDE5E2', paddingTop: 12, marginTop: 10 }, total: { fontSize: 17, fontWeight: '800' }, notice: { padding: 16, borderRadius: 12 }, error: { color: '#B42318', marginTop: 12 }, primary: { minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 24 }, primaryText: { color: '#FFFFFF', fontWeight: '700' }, cancel: { minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 10 }, cancelText: { color: '#B42318', fontWeight: '700' } });

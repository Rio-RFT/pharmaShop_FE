import { LoadingIndicator } from '@/shared/components/loading-indicator';
import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/app-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { usePullToRefresh } from '@/shared/hooks/use-pull-to-refresh';
import { useAuth } from '@/features/auth/auth-provider';
import { cancelOrder, getOrderById, type OrderItem } from '@/features/orders/api/orders';
import { ApiError } from '@/shared/api/client';

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const orderLabels: Record<string, string> = { PENDING: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', SHIPPING: 'Đang giao', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy' };
const paymentLabels: Record<string, string> = { PENDING: 'Chưa thanh toán', PAID: 'Đã thanh toán', FAILED: 'Thanh toán thất bại', REFUNDED: 'Đã hoàn tiền' };

export default function OrderDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { id: orderId } = useLocalSearchParams<{ id: string }>();
  const [actionError, setActionError] = useState('');
  const detail = useQuery({ queryKey: ['orders', 'detail', orderId], queryFn: () => getOrderById(orderId), enabled: !!user && !!orderId });
  const pullRefresh = usePullToRefresh();
  useFocusEffect(useCallback(() => { if (detail.data) void detail.refetch(); }, [detail.refetch]));
  const cancel = useMutation({ mutationFn: () => cancelOrder(orderId), onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['orders', 'detail', orderId] }), queryClient.invalidateQueries({ queryKey: ['orders', 'my'] })]); }, onError: (error) => setActionError(error instanceof ApiError ? error.message : 'Không hủy được đơn hàng.') });
  const order = detail.data;
  const canCancel = order?.status === 'PENDING' && order.paymentStatus !== 'PAID';
  const canPay = order?.paymentMethod === 'PAYOS' && order.paymentStatus !== 'PAID' && order.status !== 'CANCELLED';
  const pay = () => { if (!order) return; setActionError(''); router.push({ pathname: '/payment/payos/[orderId]', params: { orderId } }); };
  const confirmCancel = () => Alert.alert('Hủy đơn hàng?', 'Đơn hàng đang chờ xử lý sẽ được hủy.', [{ text: 'Để sau', style: 'cancel' }, { text: 'Hủy đơn', style: 'destructive', onPress: () => cancel.mutate() }]);

  return <ThemedView style={styles.page}><SafeAreaView style={styles.safe} edges={['top', 'bottom']}><AppHeader /><ScrollView alwaysBounceVertical refreshControl={<RefreshControl refreshing={pullRefresh.refreshing} onRefresh={() => void pullRefresh.onRefresh()} tintColor={theme.tint} colors={[theme.tint]} />} contentContainerStyle={styles.content}>
    <ThemedText style={styles.title}>Chi tiết đơn hàng</ThemedText>
    {!user ? <View style={styles.notice}><ThemedText>Đăng nhập để xem đơn hàng.</ThemedText><Link href="/auth/login" style={{ color: theme.tint, marginTop: 10 }}>Đăng nhập</Link></View> : detail.isLoading ? <OrderDetailSkeleton /> : detail.error ? <View style={styles.notice}><ThemedText style={styles.error}>{detail.error instanceof ApiError ? detail.error.message : 'Không tải được đơn hàng.'}</ThemedText><Pressable onPress={() => void detail.refetch()}><ThemedText style={{ color: theme.tint, marginTop: 10 }}>Thử lại</ThemedText></Pressable></View> : order ? <>
      <View style={[styles.orderSummary, { backgroundColor: theme.backgroundElement }]}>
        <View style={styles.summaryTop}><View><ThemedText themeColor="textSecondary" style={styles.eyebrow}>MÃ ĐƠN HÀNG</ThemedText><ThemedText style={styles.code}>#{order.id.slice(-8).toUpperCase()}</ThemedText></View><View style={[styles.statusPill, { backgroundColor: theme.backgroundSelected }]}><ThemedText style={[styles.status, { color: theme.tint }]}>{orderLabels[order.status] ?? order.status}</ThemedText></View></View>
        <View style={[styles.summaryDivider, { borderTopColor: theme.backgroundSelected }]} />
        <View style={styles.summaryMetaRow}><ThemedText themeColor="textSecondary">Ngày đặt</ThemedText><ThemedText style={styles.summaryValue}>{new Date(order.createdAt).toLocaleString('vi-VN')}</ThemedText></View>
        <View style={styles.summaryMetaRow}><ThemedText themeColor="textSecondary">Thanh toán</ThemedText><ThemedText style={styles.summaryValue}>{order.paymentMethod} · {paymentLabels[order.paymentStatus] ?? order.paymentStatus}</ThemedText></View>
      </View>
      <ThemedText style={styles.section}>Sản phẩm ({order.items.length})</ThemedText>
      <View style={[styles.productList, { backgroundColor: theme.backgroundElement }]}>{order.items.map((item, index) => <OrderProductRow key={item.id} item={item} isLast={index === order.items.length - 1} />)}</View>
      <ThemedText style={styles.section}>Thông tin giao hàng</ThemedText>
      <View style={[styles.infoBlock, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText style={styles.itemName}>{order.receiverName ?? 'Người nhận'}</ThemedText>
        {order.receiverPhone ? <ThemedText themeColor="textSecondary" style={styles.meta}>{order.receiverPhone}</ThemedText> : null}
        <ThemedText themeColor="textSecondary" style={styles.meta}>{order.shippingAddress ?? 'Chưa có địa chỉ'}</ThemedText>
      </View>
      <ThemedText style={styles.section}>Thanh toán</ThemedText>
      <View style={[styles.infoBlock, { backgroundColor: theme.backgroundElement }]}>
        {order.subtotalAmount !== undefined ? <View style={styles.moneyRow}><ThemedText themeColor="textSecondary">Tạm tính</ThemedText><ThemedText>{money.format(Number(order.subtotalAmount))}</ThemedText></View> : null}
        {Number(order.discountAmount ?? 0) > 0 ? <View style={styles.moneyRow}><ThemedText themeColor="textSecondary">Giảm giá{order.couponCode ? ` (${order.couponCode})` : ''}</ThemedText><ThemedText style={styles.discount}>−{money.format(Number(order.discountAmount))}</ThemedText></View> : null}
        <View style={styles.totalRow}><ThemedText style={styles.itemName}>Tổng cộng</ThemedText><ThemedText style={[styles.total, { color: theme.tint }]}>{money.format(Number(order.totalAmount))}</ThemedText></View>
      </View>
      {actionError ? <ThemedText accessibilityRole="alert" style={styles.error}>{actionError}</ThemedText> : null}
      {canPay ? <Pressable accessibilityRole="button" onPress={pay} style={[styles.primary, { backgroundColor: theme.tint }]}><ThemedText style={styles.primaryText}>Tiếp tục thanh toán PayOS</ThemedText></Pressable> : null}
      {canCancel ? <Pressable accessibilityRole="button" disabled={cancel.isPending} onPress={confirmCancel} style={[styles.cancel, { borderColor: theme.backgroundSelected }]}>{cancel.isPending ? <LoadingIndicator size="small" color={theme.tint} /> : <ThemedText style={styles.cancelText}>Hủy đơn hàng</ThemedText>}</Pressable> : null}
    </> : null}
  </ScrollView></SafeAreaView></ThemedView>;
}

function OrderProductRow({ item, isLast }: { item: OrderItem; isLast: boolean }) {
  const theme = useTheme();
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = item.medicine?.imageUrl;
  const name = item.medicine?.name ?? item.medicineName ?? `Sản phẩm ${item.medicineId}`;
  return <View style={[styles.productRow, !isLast && { borderBottomColor: theme.backgroundSelected, borderBottomWidth: StyleSheet.hairlineWidth }]}>
    <View style={[styles.productImageFrame, { backgroundColor: theme.backgroundSelected }]}>
      {imageUrl && !imageFailed ? <Image source={{ uri: imageUrl }} style={styles.productImage} contentFit="contain" transition={150} onError={() => setImageFailed(true)} accessibilityLabel={`Ảnh ${name}`} /> : <SymbolView name={{ ios: 'cross.case', android: 'medical_services', web: 'medical_services' }} size={28} tintColor={theme.tint} />}
    </View>
    <View style={styles.productDetails}>
      <ThemedText style={styles.itemName} numberOfLines={3}>{name}</ThemedText>
      <View style={styles.productMetaRow}><ThemedText themeColor="textSecondary" style={styles.productUnitPrice}>{money.format(Number(item.unitPrice))} / sản phẩm</ThemedText><View style={[styles.quantityPill, { backgroundColor: theme.backgroundSelected }]}><ThemedText style={[styles.quantityText, { color: theme.tint }]}>SL {item.quantity}</ThemedText></View></View>
      <View style={styles.productSubtotalRow}><ThemedText themeColor="textSecondary" style={styles.productUnitPrice}>Thành tiền</ThemedText><ThemedText style={[styles.lineTotal, { color: theme.tint }]}>{money.format(Number(item.unitPrice) * item.quantity)}</ThemedText></View>
    </View>
  </View>;
}

function OrderDetailSkeleton() {
  const theme = useTheme();
  const line = (style: object, color: string = theme.backgroundElement) => <View style={[styles.skeletonLine, style, { backgroundColor: color }]} />;
  return <View accessibilityRole="progressbar" accessibilityLabel="Đang tải chi tiết đơn hàng">
    <View style={styles.skeletonSummary}>{line(styles.skeletonCode)}{line(styles.skeletonStatus, theme.backgroundSelected)}{line(styles.skeletonMeta)}{line(styles.skeletonMetaShort)}</View>
    {line(styles.skeletonHeading)}
    {[0, 1].map((item) => <View key={item} style={styles.skeletonProductRow}><View style={[styles.skeletonImage, { backgroundColor: theme.backgroundElement }]} /><View style={styles.skeletonProductText}>{line(styles.skeletonProductName)}{line(styles.skeletonProductMeta)}{line(styles.skeletonProductPrice, theme.backgroundSelected)}</View></View>)}
    {line(styles.skeletonHeading)}<View style={styles.skeletonBlock}>{line(styles.skeletonAddressName)}{line(styles.skeletonAddress)}{line(styles.skeletonAddressShort)}</View>
    {line(styles.skeletonHeading)}<View style={styles.skeletonBlock}>{[0, 1].map((item) => <View key={item} style={styles.moneyRow}>{line(styles.skeletonPriceLabel)}{line(styles.skeletonPriceValue)}</View>)}<View style={styles.skeletonTotal}>{line(styles.skeletonPriceLabel)}{line(styles.skeletonPriceTotal, theme.backgroundSelected)}</View></View>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, safe: { flex: 1 }, content: { padding: 20, paddingBottom: 30 }, title: { fontSize: 26, fontWeight: '800', marginBottom: 18 },
  orderSummary: { padding: 16, borderRadius: 16 }, summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 0.7, marginBottom: 4 }, code: { fontWeight: '800', fontSize: 17 }, statusPill: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 }, status: { fontWeight: '700', fontSize: 12 }, summaryDivider: { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: 13 }, summaryMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginTop: 8 }, summaryValue: { flex: 1, textAlign: 'right', fontSize: 13, fontWeight: '500' }, meta: { fontSize: 13, lineHeight: 19, marginTop: 5 },
  section: { fontSize: 17, fontWeight: '700', marginTop: 24, marginBottom: 8 }, productList: { borderRadius: 16, paddingHorizontal: 12 }, productRow: { flexDirection: 'row', gap: 13, paddingVertical: 14 }, productImageFrame: { width: 88, height: 88, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, productImage: { width: '100%', height: '100%' }, productDetails: { flex: 1, gap: 7, minWidth: 0, justifyContent: 'center' }, itemName: { fontWeight: '600', lineHeight: 20 }, productMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }, productUnitPrice: { fontSize: 12 }, quantityPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 }, quantityText: { fontSize: 11, fontWeight: '700' }, productSubtotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 }, lineTotal: { fontSize: 14, fontWeight: '700' },
  infoBlock: { padding: 15, borderRadius: 14, gap: 9 }, moneyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DDE5E2', paddingTop: 13, marginTop: 3 }, total: { fontSize: 17, fontWeight: '800' }, discount: { color: '#168A68', fontWeight: '600' },
  notice: { padding: 16, borderRadius: 12 }, error: { color: '#B42318', marginTop: 12 }, primary: { minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 24 }, primaryText: { color: '#FFFFFF', fontWeight: '700' }, cancel: { minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 10 }, cancelText: { color: '#B42318', fontWeight: '700' },
  skeletonSummary: { padding: 16, borderRadius: 16, backgroundColor: '#F3F7F5', gap: 10 }, skeletonLine: { height: 12, borderRadius: 6 }, skeletonCode: { width: '38%', height: 16 }, skeletonStatus: { position: 'absolute', right: 32, top: 29, width: '28%', height: 14 }, skeletonMeta: { width: '58%', marginTop: 5 }, skeletonMetaShort: { width: '43%' }, skeletonHeading: { width: 125, height: 17, marginTop: 24, marginBottom: 10 }, skeletonProductRow: { flexDirection: 'row', gap: 13, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5EBE8' }, skeletonImage: { width: 82, height: 82, borderRadius: 14 }, skeletonProductText: { flex: 1, justifyContent: 'center', gap: 10 }, skeletonProductName: { width: '88%', height: 14 }, skeletonProductMeta: { width: '66%', height: 10 }, skeletonProductPrice: { width: 80, height: 13 }, skeletonBlock: { padding: 15, borderRadius: 14, backgroundColor: '#F3F7F5', gap: 12 }, skeletonAddressName: { width: '48%' }, skeletonAddress: { width: '90%', height: 10 }, skeletonAddressShort: { width: '65%', height: 10 }, skeletonPriceLabel: { width: 72 }, skeletonPriceValue: { width: 88, height: 10 }, skeletonTotal: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DDE5E2', paddingTop: 12 }, skeletonPriceTotal: { width: 102, height: 17 },
});

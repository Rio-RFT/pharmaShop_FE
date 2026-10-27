import { LoadingIndicator } from '@/shared/components/loading-indicator';
import { Link, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/app-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/features/auth/auth-provider';
import { getMyOrders } from '@/features/orders/api/orders';
import { ApiError } from '@/shared/api/client';
import { useTheme } from '@/hooks/use-theme';
import { usePullToRefresh } from '@/shared/hooks/use-pull-to-refresh';

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const statusLabels: Record<string, string> = { PENDING: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', SHIPPING: 'Đang giao', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy' };

export default function OrdersScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const orders = useQuery({ queryKey: ['orders', 'my', user?.id], queryFn: () => getMyOrders(), enabled: !!user, refetchOnWindowFocus: true });
  const pullRefresh = usePullToRefresh();
  return <ThemedView style={styles.page}><SafeAreaView style={styles.safe} edges={['top']}><AppHeader /><ScrollView alwaysBounceVertical refreshControl={<RefreshControl refreshing={pullRefresh.refreshing} onRefresh={() => void pullRefresh.onRefresh()} tintColor={theme.tint} colors={[theme.tint]} />} contentContainerStyle={styles.content}>
    <ThemedText style={styles.title}>Đơn hàng</ThemedText><ThemedText themeColor="textSecondary" style={styles.subtitle}>Theo dõi lịch sử mua hàng</ThemedText>
    {authLoading ? <LoadingIndicator size={60} color={theme.tint} /> : !user ? <View style={[styles.notice, { backgroundColor: theme.backgroundElement }]}><ThemedText style={styles.noticeTitle}>Đăng nhập để xem đơn hàng</ThemedText><Link href="/auth/login" style={{ color: theme.tint, fontWeight: '700', marginTop: 12 }}>Đăng nhập</Link></View> : orders.isLoading ? <LoadingIndicator size={60} color={theme.tint} /> : orders.error ? <View style={styles.notice}><ThemedText style={styles.error}>{orders.error instanceof ApiError ? orders.error.message : 'Không tải được đơn hàng.'}</ThemedText><Pressable accessibilityRole="button" onPress={() => void orders.refetch()}><ThemedText style={{ color: theme.tint, marginTop: 10 }}>Thử lại</ThemedText></Pressable></View> : orders.data?.data.length ? orders.data.data.map((order) => <Pressable accessibilityRole="button" key={order.id} onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })} style={[styles.order, { borderBottomColor: theme.backgroundElement }]}>
      <View style={styles.orderHeader}><ThemedText style={styles.orderCode}>Đơn #{order.id.slice(-8).toUpperCase()}</ThemedText><ThemedText style={[styles.status, { color: theme.tint }]}>{statusLabels[order.status] ?? order.status}</ThemedText></View>
      <ThemedText themeColor="textSecondary" style={styles.meta}>{new Date(order.createdAt).toLocaleDateString('vi-VN')} · {order.items.length} sản phẩm · {order.paymentStatus === 'PAID' ? 'Đã thanh toán' : 'Chưa thanh toán'}</ThemedText>
      <ThemedText style={[styles.price, { color: theme.tint }]}>{money.format(Number(order.totalAmount))}</ThemedText>
    </Pressable>) : <View style={[styles.notice, { backgroundColor: theme.backgroundElement }]}><ThemedText style={styles.noticeTitle}>Chưa có đơn hàng</ThemedText><Link href="/" style={{ color: theme.tint, marginTop: 10 }}>Khám phá sản phẩm</Link></View>}
  </ScrollView></SafeAreaView></ThemedView>;
}

const styles = StyleSheet.create({ page: { flex: 1 }, safe: { flex: 1 }, content: { padding: 20, paddingBottom: 32 }, title: { fontSize: 28, fontWeight: '800' }, subtitle: { marginTop: 5, marginBottom: 24, fontSize: 14 }, notice: { padding: 18, borderRadius: 15, marginTop: 12 }, noticeTitle: { fontSize: 16, fontWeight: '700' }, order: { paddingVertical: 17, borderBottomWidth: StyleSheet.hairlineWidth }, orderHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, orderCode: { fontSize: 14, fontWeight: '700' }, status: { fontSize: 12, fontWeight: '700' }, meta: { marginTop: 7, fontSize: 12 }, price: { marginTop: 9, fontSize: 16, fontWeight: '700' }, error: { color: '#B42318' } });

import { LoadingIndicator } from '@/shared/components/loading-indicator';
import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/app-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/features/auth/auth-provider';
import { getOrderById } from '@/features/orders/api/orders';
import { clearPendingPayOSOrder, readPendingPayOSOrder } from '@/features/payments/pending-order';
import { ApiError } from '@/shared/api/client';

type Props = { outcome: 'return' | 'cancel' };

export function PaymentResultScreen({ outcome }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ orderCode?: string | string[] }>();
  const orderCode = Array.isArray(params.orderCode) ? params.orderCode[0] : params.orderCode;
  const result = useQuery({
    queryKey: ['payments', 'payos-return', user?.id, orderCode],
    enabled: !!user,
    retry: false,
    queryFn: async () => {
      const pendingOrderId = await readPendingPayOSOrder();
      if (!pendingOrderId) return null;
      const order = await getOrderById(pendingOrderId);
      if (order.paymentMethod !== 'PAYOS') throw new ApiError('Đơn hàng này không sử dụng PayOS.');
      if (orderCode && order.paymentOrderCode != null && String(order.paymentOrderCode) !== orderCode) {
        throw new ApiError('Mã giao dịch không khớp với đơn hàng đang chờ thanh toán.');
      }
      return order;
    },
  });
  useFocusEffect(useCallback(() => { if (user) void result.refetch(); }, [result.refetch, user]));
  useEffect(() => {
    if (!result.data) return;
    queryClient.setQueryData(['orders', 'detail', result.data.id], result.data);
    void queryClient.invalidateQueries({ queryKey: ['orders', 'my'] });
  }, [queryClient, result.data]);

  const order = result.data;
  const paid = order?.paymentStatus === 'PAID';
  const heading = outcome === 'return' ? (paid ? 'Thanh toán thành công' : 'Đã quay lại từ PayOS') : 'Bạn đã quay lại từ PayOS';
  const description = order
    ? paid ? 'Backend đã xác nhận thanh toán cho đơn hàng.' : 'Trạng thái đơn hàng được lấy từ máy chủ. Nếu bạn vừa thanh toán, trạng thái có thể cần một chút thời gian để cập nhật.'
    : 'Không có đơn PayOS đang chờ trên thiết bị này. Bạn có thể xem danh sách đơn hàng trong tài khoản.';

  return <ThemedView style={styles.page}><SafeAreaView style={styles.safe} edges={['top', 'bottom']}><AppHeader /><ScrollView contentContainerStyle={styles.content}>
    {!user ? <View style={styles.body}><ThemedText style={styles.title}>Đăng nhập để xem đơn hàng</ThemedText><ThemedText themeColor="textSecondary" style={styles.description}>PayOS đã quay lại ứng dụng. Đăng nhập để tải trạng thái thanh toán từ máy chủ.</ThemedText><Link href="/auth/login" style={[styles.primaryText, { backgroundColor: theme.tint }]}>Đăng nhập</Link></View>
      : result.isLoading ? <View style={styles.loading}><LoadingIndicator size={60} color={theme.tint} /><ThemedText themeColor="textSecondary">Đang đồng bộ trạng thái đơn hàng…</ThemedText></View>
        : <View style={styles.body}>
          <View style={[styles.mark, { backgroundColor: paid ? '#E5F4ED' : theme.backgroundElement }]}><ThemedText style={[styles.markText, { color: paid ? '#18845A' : theme.tint }]}>{paid ? '✓' : outcome === 'cancel' ? '↩' : '…'}</ThemedText></View>
          <ThemedText style={styles.title}>{heading}</ThemedText><ThemedText themeColor="textSecondary" style={styles.description}>{description}</ThemedText>
          {result.error ? <ThemedText accessibilityRole="alert" style={styles.error}>{result.error instanceof ApiError ? result.error.message : 'Không tải được trạng thái đơn hàng.'}</ThemedText> : null}
          {order ? <View style={[styles.orderSummary, { backgroundColor: theme.backgroundElement }]}><ThemedText style={styles.orderCode}>Đơn #{order.id.slice(-8).toUpperCase()}</ThemedText><ThemedText themeColor="textSecondary" style={styles.paymentState}>{order.paymentStatus === 'PAID' ? 'Đã thanh toán' : order.paymentStatus === 'FAILED' ? 'Thanh toán thất bại' : 'Đang chờ xác nhận thanh toán'}</ThemedText></View> : null}
          {order ? <>
            {!paid ? <Pressable accessibilityRole="button" onPress={() => void result.refetch()} style={[styles.retry, { borderColor: theme.backgroundSelected }]}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Kiểm tra trạng thái lại</ThemedText></Pressable> : null}
            <Pressable accessibilityRole="button" onPress={() => { void clearPendingPayOSOrder(); router.replace({ pathname: '/order/[id]', params: { id: order.id } }); }} style={[styles.primary, { backgroundColor: theme.tint }]}><ThemedText style={styles.primaryText}>Xem đơn hàng</ThemedText></Pressable>
          </> : <Pressable accessibilityRole="button" onPress={() => void result.refetch()} style={[styles.primary, { backgroundColor: theme.tint }]}><ThemedText style={styles.primaryText}>Thử đồng bộ lại</ThemedText></Pressable>}
          <Link href="/orders" style={[styles.secondary, { color: theme.tint }]}>Danh sách đơn hàng</Link>
        </View>}
  </ScrollView></SafeAreaView></ThemedView>;
}

const styles = StyleSheet.create({ page: { flex: 1 }, safe: { flex: 1 }, content: { flexGrow: 1, justifyContent: 'center', padding: 22 }, body: { alignItems: 'center', width: '100%' }, loading: { alignItems: 'center', gap: 12 }, mark: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }, markText: { fontSize: 30, fontWeight: '800' }, title: { fontSize: 23, fontWeight: '800', textAlign: 'center' }, description: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10 }, orderSummary: { width: '100%', padding: 16, borderRadius: 14, marginTop: 22, alignItems: 'center' }, orderCode: { fontWeight: '700' }, paymentState: { fontSize: 13, marginTop: 6 }, error: { color: '#B42318', textAlign: 'center', marginTop: 14 }, retry: { minHeight: 46, width: '100%', borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 20 }, primary: { minHeight: 50, width: '100%', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 12 }, primaryText: { color: '#FFFFFF', fontWeight: '700', textAlign: 'center', overflow: 'hidden', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12 }, secondary: { fontWeight: '700', marginTop: 18, padding: 10 } });

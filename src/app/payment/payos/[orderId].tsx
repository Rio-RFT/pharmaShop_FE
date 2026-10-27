import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { AppHeader } from '@/components/app-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LoadingIndicator } from '@/shared/components/loading-indicator';
import { useTheme } from '@/hooks/use-theme';
import { getOrderById, createPayOSLink, type PayOSLink } from '@/features/orders/api/orders';
import { clearPendingPayOSOrder, savePendingPayOSOrder } from '@/features/payments/pending-order';
import { ApiError } from '@/shared/api/client';
import { usePullToRefresh } from '@/shared/hooks/use-pull-to-refresh';

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

export default function PayOSPaymentScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ orderId: string | string[] }>();
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
  const pollingDeadline = useRef(Date.now() + 120_000);
  const [openingCheckout, setOpeningCheckout] = useState(false);
  const [savingQr, setSavingQr] = useState(false);
  const [qrMessage, setQrMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const payment = useQuery({
    queryKey: ['payments', 'payos', orderId],
    queryFn: () => createPayOSLink(orderId),
    enabled: !!orderId,
    retry: 1,
  });
  const order = useQuery({
    queryKey: ['orders', 'detail', orderId],
    queryFn: () => getOrderById(orderId),
    enabled: !!orderId,
    retry: 1,
    refetchInterval: (query) => query.state.data?.paymentStatus === 'PAID' || Date.now() >= pollingDeadline.current ? false : 15_000,
  });
  const pullRefresh = usePullToRefresh(async () => {
    await Promise.all([payment.refetch(), order.refetch()]);
  });
  const link = payment.data;
  const zeroAmountPaid = link?.checkoutUrl === null && link.paymentStatus === 'PAID' && Number(link.amount) === 0;
  const paid = order.data?.paymentStatus === 'PAID' || zeroAmountPaid;

  useEffect(() => {
    if (link && orderId) void savePendingPayOSOrder(orderId).catch(() => undefined);
  }, [link, orderId]);

  useEffect(() => {
    if (order.data) {
      queryClient.setQueryData(['orders', 'detail', order.data.id], order.data);
      void queryClient.invalidateQueries({ queryKey: ['orders', 'my'] });
    }
  }, [order.data, queryClient]);

  useFocusEffect(useCallback(() => {
    if (orderId) void order.refetch();
  }, [order.refetch, orderId]));

  const openCheckout = async () => {
    const checkoutUrl = link?.checkoutUrl;
    if (!checkoutUrl || openingCheckout) return;
    try {
      const url = new URL(checkoutUrl);
      if (url.protocol !== 'https:' || !(url.hostname === 'pay.payos.vn' || url.hostname.endsWith('.payos.vn'))) {
        throw new Error('Đường dẫn thanh toán PayOS không hợp lệ.');
      }
      setOpeningCheckout(true);
      await WebBrowser.openBrowserAsync(url.toString());
      // A browser return is not proof of payment; always read the order status from the API.
      await order.refetch();
    } catch (error) {
      Alert.alert('Không mở được PayOS', error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Vui lòng thử lại.');
    } finally {
      setOpeningCheckout(false);
    }
  };

  const saveQr = async () => {
    if (!link?.qrCode || savingQr) return;
    setSavingQr(true);
    setQrMessage(null);
    try {
      const qrUrl = new URL(link.qrCode);
      if (qrUrl.protocol !== 'https:') throw new Error('Đường dẫn mã QR không an toàn.');
      const fileName = `PharmaShop-PayOS-${link.orderCode ?? orderId}.png`;
      if (Platform.OS === 'web') {
        const response = await fetch(qrUrl.toString());
        if (!response.ok) throw new Error('Không tải được ảnh mã QR.');
        const objectUrl = URL.createObjectURL(await response.blob());
        if (typeof document === 'undefined') throw new Error('Không thể tải ảnh QR trên trình duyệt này.');
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = fileName.replace(/\.png$/i, qrUrl.pathname.toLowerCase().endsWith('.svg') ? '.svg' : '.png');
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
      } else {
        const extension = qrUrl.pathname.toLowerCase().endsWith('.svg') ? 'svg' : 'png';
        const [{ File, Paths }, Sharing] = await Promise.all([
          import('expo-file-system'),
          import('expo-sharing'),
        ]);
        if (!(await Sharing.isAvailableAsync())) throw new Error('Thiết bị không hỗ trợ lưu/chia sẻ ảnh.');
        const destination = new File(Paths.cache, `PharmaShop-PayOS-${link.orderCode ?? orderId}.${extension}`);
        if (destination.exists) destination.delete();
        const file = await File.downloadFileAsync(qrUrl.toString(), destination);
        await Sharing.shareAsync(file.uri, { mimeType: extension === 'svg' ? 'image/svg+xml' : 'image/png', dialogTitle: 'Lưu mã QR PayOS', UTI: extension === 'svg' ? 'public.svg-image' : 'public.png' });
      }
      setQrMessage(Platform.OS === 'web' ? 'Đã tải mã QR xuống thiết bị.' : 'Đã mở tùy chọn lưu mã QR.');
    } catch (error) {
      setQrMessage(error instanceof Error ? error.message : 'Không lưu được mã QR. Vui lòng thử lại.');
    } finally {
      setSavingQr(false);
    }
  };

  const copyPaymentInfo = async () => {
    if (!link) return;
    const details = [
      `Số tiền: ${money.format(Number(link.amount))}`,
      link.account?.bankBin ? `Mã ngân hàng (BIN): ${link.account.bankBin}` : null,
      link.account?.accountNumber ? `Số tài khoản: ${link.account.accountNumber}` : null,
      link.account?.accountName ? `Tên chủ tài khoản: ${link.account.accountName}` : null,
      link.description ? `Nội dung chuyển khoản: ${link.description}` : null,
    ].filter((value): value is string => value !== null).join('\n');
    try {
      const Clipboard = await import('expo-clipboard');
      await Clipboard.setStringAsync(details);
      setCopyMessage('Đã sao chép thông tin chuyển khoản.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setCopyMessage(message.includes("Cannot find native module 'ExpoClipboard'")
        ? 'Sao chép trên Android cần development build có Expo Clipboard.'
        : 'Không sao chép được. Vui lòng thử lại.');
    }
  };

  const viewOrder = () => {
    void clearPendingPayOSOrder();
    router.replace({ pathname: '/order/[id]', params: { id: orderId } });
  };

  return <ThemedView style={styles.page}><SafeAreaView style={styles.safe} edges={['top', 'bottom']}><AppHeader /><ScrollView alwaysBounceVertical refreshControl={<RefreshControl refreshing={pullRefresh.refreshing} onRefresh={() => void pullRefresh.onRefresh()} tintColor={theme.tint} colors={[theme.tint]} />} contentContainerStyle={styles.content}>
    <ThemedText style={styles.title}>Thanh toán PayOS</ThemedText>
    {payment.isLoading ? <View style={styles.state}><LoadingIndicator size={52} color={theme.tint} /><ThemedText themeColor="textSecondary">Đang tải hướng dẫn thanh toán…</ThemedText></View>
      : payment.error ? <View style={styles.state}><ThemedText style={styles.error}>{payment.error instanceof ApiError ? payment.error.message : 'Không tải được hướng dẫn thanh toán.'}</ThemedText><Pressable accessibilityRole="button" onPress={() => void payment.refetch()} style={[styles.secondaryButton, { borderColor: theme.backgroundSelected }]}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Tải lại hướng dẫn</ThemedText></Pressable></View>
        : paid ? <View style={styles.state}><View style={[styles.paidMark, { backgroundColor: '#E5F4ED' }]}><ThemedText style={[styles.paidCheck, { color: '#18845A' }]}>✓</ThemedText></View><ThemedText style={styles.sectionTitle}>{zeroAmountPaid ? 'Đã thanh toán 0₫' : 'PayOS đã xác nhận thanh toán'}</ThemedText><ThemedText themeColor="textSecondary" style={styles.description}>{zeroAmountPaid ? link?.message ?? 'Đơn hàng không còn khoản tiền phải thanh toán.' : 'Đã cập nhật đơn hàng sau khi xác nhận thanh toán.'}</ThemedText><Pressable accessibilityRole="button" onPress={viewOrder} style={[styles.primaryButton, { backgroundColor: theme.tint }]}><ThemedText style={styles.primaryText}>Xem đơn hàng</ThemedText></Pressable></View>
          : link ? <>
            {link.qrCode ? <View style={[styles.qrSection, { backgroundColor: theme.backgroundElement }]}><ThemedText style={styles.sectionTitle}>Quét mã để thanh toán</ThemedText><View style={styles.qrFrame}><Image source={{ uri: link.qrCode }} contentFit="contain" style={styles.qrImage} accessibilityLabel="Mã QR PayOS" onError={() => setQrMessage('Không tải được ảnh QR từ máy chủ.')} /></View><Pressable accessibilityRole="button" disabled={savingQr} onPress={() => void saveQr()} style={[styles.secondaryButton, { borderColor: theme.tint, opacity: savingQr ? 0.6 : 1 }]}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>{savingQr ? 'Đang tải…' : 'Tải mã QR xuống'}</ThemedText></Pressable>{qrMessage ? <ThemedText accessibilityRole="alert" themeColor="textSecondary" style={styles.qrMessage}>{qrMessage}</ThemedText> : null}</View> : <View style={[styles.legacyNotice, { backgroundColor: theme.backgroundElement }]}><ThemedText themeColor="textSecondary">Link thanh toán cũ không có mã QR. Bạn vẫn có thể mở PayOS để thanh toán.</ThemedText></View>}
            <View style={[styles.details, { borderColor: theme.backgroundSelected }]}>
              <ThemedText style={styles.sectionTitle}>Thông tin chuyển khoản</ThemedText>
              <InfoRow label="Số tiền" value={money.format(Number(link.amount))} accent={theme.tint} />
              {link.currency ? <InfoRow label="Loại tiền" value={link.currency} /> : null}
              {link.description ? <InfoRow label="Nội dung chuyển khoản" value={link.description} /> : null}
              {link.account?.bankBin ? <InfoRow label="Mã ngân hàng (BIN)" value={link.account.bankBin} /> : null}
              {link.account?.accountNumber ? <InfoRow label="Số tài khoản" value={link.account.accountNumber} /> : null}
              {link.account?.accountName ? <InfoRow label="Tên chủ tài khoản" value={link.account.accountName} /> : null}
              {!link.account && !link.qrCode ? <ThemedText themeColor="textSecondary" style={styles.description}>Thông tin tài khoản không được lưu cùng link cũ. Hãy mở trang PayOS để xem lựa chọn thanh toán.</ThemedText> : null}
              <Pressable accessibilityRole="button" onPress={() => void copyPaymentInfo()} style={[styles.secondaryButton, { borderColor: theme.tint }]}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Sao chép thông tin chuyển khoản</ThemedText></Pressable>
              {copyMessage ? <ThemedText accessibilityRole="alert" themeColor="textSecondary" style={styles.qrMessage}>{copyMessage}</ThemedText> : null}
            </View>
            {link.checkoutUrl ? <Pressable accessibilityRole="button" disabled={openingCheckout} onPress={() => void openCheckout()} style={[styles.primaryButton, { backgroundColor: theme.tint, opacity: openingCheckout ? 0.65 : 1 }]}>{openingCheckout ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.primaryText}>Mở trang thanh toán PayOS</ThemedText>}</Pressable> : <ThemedText accessibilityRole="alert" style={styles.error}>Link thanh toán hiện không khả dụng. Đơn hàng vẫn được giữ để kiểm tra lại.</ThemedText>}
            <View style={[styles.pendingStatus, { backgroundColor: theme.backgroundElement }]}><ThemedText style={styles.statusTitle}>{order.data?.paymentStatus === 'PAID' ? 'Đã xác nhận thanh toán' : 'Đang chờ xác nhận thanh toán'}</ThemedText><ThemedText themeColor="textSecondary" style={styles.description}>Việc mở hoặc đóng PayOS không xác nhận thanh toán. Trạng thái chỉ đổi khi nhận webhook và cập nhật đơn.</ThemedText><Pressable accessibilityRole="button" onPress={() => void order.refetch()} style={styles.checkButton}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Kiểm tra trạng thái</ThemedText></Pressable></View>
            {order.data?.paymentStatus === 'PAID' ? <Pressable accessibilityRole="button" onPress={viewOrder} style={[styles.primaryButton, { backgroundColor: theme.tint }]}><ThemedText style={styles.primaryText}>Xem đơn hàng</ThemedText></Pressable> : null}
          </> : null}
    {order.error ? <ThemedText accessibilityRole="alert" style={styles.error}>{order.error instanceof ApiError ? order.error.message : 'Chưa tải được trạng thái đơn hàng.'}</ThemedText> : null}
    {!order.data && !order.isLoading ? <Pressable accessibilityRole="button" onPress={() => void order.refetch()}><ThemedText style={{ color: theme.tint, fontWeight: '700', textAlign: 'center', marginTop: 16 }}>Tải trạng thái đơn hàng</ThemedText></Pressable> : null}
    <Link href="/orders" style={[styles.ordersLink, { color: theme.tint }]}>Danh sách đơn hàng</Link>
  </ScrollView></SafeAreaView></ThemedView>;
}

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return <View style={styles.infoRow}><ThemedText themeColor="textSecondary" style={styles.infoLabel}>{label}</ThemedText><ThemedText selectable style={[styles.infoValue, accent ? { color: accent } : null]}>{value}</ThemedText></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, safe: { flex: 1 }, content: { padding: 20, paddingBottom: 36 },
  title: { fontSize: 25, fontWeight: '800', marginBottom: 16 }, state: { alignItems: 'center', gap: 13, paddingVertical: 36 },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 13 }, description: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 },
  qrSection: { alignItems: 'center', padding: 18, borderRadius: 18, marginBottom: 18 }, qrFrame: { width: 264, height: 264, backgroundColor: '#FFFFFF', padding: 12, borderRadius: 12, marginVertical: 4, alignItems: 'center', justifyContent: 'center' }, qrImage: { width: 240, height: 240 },
  qrMessage: { fontSize: 12, textAlign: 'center', marginTop: 10 }, legacyNotice: { padding: 14, borderRadius: 12, marginBottom: 16 },
  details: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 }, infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5EAE7' }, infoLabel: { flex: 1, fontSize: 13 }, infoValue: { flex: 1, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  primaryButton: { minHeight: 50, paddingHorizontal: 18, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 8 }, primaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  secondaryButton: { minHeight: 44, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  pendingStatus: { padding: 16, borderRadius: 14, marginTop: 16 }, statusTitle: { fontSize: 14, fontWeight: '700', textAlign: 'center' }, checkButton: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 12, marginTop: 5 },
  paidMark: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' }, paidCheck: { fontSize: 31, fontWeight: '800' }, error: { color: '#B42318', textAlign: 'center', lineHeight: 20 }, ordersLink: { textAlign: 'center', fontWeight: '700', padding: 14, marginTop: 12 },
});

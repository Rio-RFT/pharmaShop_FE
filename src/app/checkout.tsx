import { LoadingIndicator } from '@/shared/components/loading-indicator';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/features/auth/auth-provider';
import { clearCart, getCart } from '@/features/cart/api/cart';
import { createOrder } from '@/features/orders/api/orders';
import { validateCoupon, type CouponPreview } from '@/features/orders/api/coupons';
import { ApiError } from '@/shared/api/client';
import { useTheme } from '@/hooks/use-theme';
import { AppHeader } from '@/components/app-header';
import { getAddresses, createAddress, type Address, type AddressInput } from '@/features/profile/api/addresses';
import { VietnamAddressFields } from '@/features/checkout/components/vietnam-address-fields';
import type { DivisionOption } from '@/features/checkout/api/vietnam-provinces';
import { usePullToRefresh } from '@/shared/hooks/use-pull-to-refresh';

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

export default function CheckoutScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ couponCode?: string | string[] }>();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const cart = useQuery({ queryKey: ['cart'], queryFn: getCart, enabled: !!user });
  const hasUnpricedCartItem = cart.data?.items.some((item) => item.medicine.price == null) ?? false;
  const addressQuery = useQuery({ queryKey: ['addresses', user?.id], queryFn: getAddresses, enabled: !!user });
  const pullRefresh = usePullToRefresh();
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [street, setStreet] = useState('');
  const [location, setLocation] = useState<{ province: DivisionOption | null; district: DivisionOption | null; ward: DivisionOption | null }>({ province: null, district: null, ward: null });
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState(typeof params.couponCode === 'string' ? params.couponCode : '');
  const [couponPreview, setCouponPreview] = useState<CouponPreview | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const autoValidatedCode = useRef('');
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'PAYOS'>('COD');
  const order = useMutation({ mutationFn: createOrder, onSuccess: async (createdOrder) => {
    try { const emptied = await clearCart(); queryClient.setQueryData(['cart'], emptied); }
    catch { await queryClient.invalidateQueries({ queryKey: ['cart'] }); }
    await queryClient.invalidateQueries({ queryKey: ['orders'] });
    if (createdOrder.paymentMethod === 'PAYOS') {
      router.replace({ pathname: '/payment/payos/[orderId]', params: { orderId: createdOrder.id } });
      return;
    }
    router.replace({ pathname: '/order/[id]', params: { id: createdOrder.id } });
  }, onError: (reason) => setError(reason instanceof ApiError ? reason.message : 'Không tạo được đơn hàng.') });
  const coupon = useMutation({
    mutationFn: ({ code, items }: { code: string; items: { medicineId: string; quantity: number }[] }) => validateCoupon(code, items),
    onSuccess: (preview) => { setCouponPreview(preview); setCouponError(null); },
    onError: (reason) => { setCouponPreview(null); setCouponError(reason instanceof ApiError ? reason.message : 'Không kiểm tra được mã giảm giá. Vui lòng thử lại.'); },
  });
  const saveAddress = useMutation({
    mutationFn: createAddress,
    onSuccess: (address) => {
      queryClient.setQueryData<Address[]>(['addresses', user?.id], (current) => current ? [address, ...current] : [address]);
      void queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      setSelectedAddressId(address.id);
      setReceiverName(address.receiverName);
      setReceiverPhone(address.phone);
      setAddressError(null);
    },
    onError: (reason) => setAddressError(reason instanceof ApiError ? reason.message : 'Không lưu được địa chỉ. Vui lòng thử lại.'),
  });
  useEffect(() => {
    setSelectedAddressId(null);
    setReceiverName(user?.fullName ?? '');
    setReceiverPhone(user?.phone ?? '');
    setStreet('');
    setLocation({ province: null, district: null, ward: null });
  }, [user]);
  const selectAddress = useCallback((address: Address) => {
    setSelectedAddressId(address.id);
    setReceiverName(address.receiverName);
    setReceiverPhone(address.phone);
  }, []);
  useEffect(() => {
    if (!user || addressQuery.isLoading || selectedAddressId !== null) return;
    const preferred = addressQuery.data?.find((address) => address.isDefault) ?? addressQuery.data?.[0];
    if (preferred) selectAddress(preferred);
    else setSelectedAddressId('new');
  }, [addressQuery.data, addressQuery.isLoading, selectAddress, selectedAddressId, user]);

  const selectedAddress = addressQuery.data?.find((address) => address.id === selectedAddressId);
  const enteringNewAddress = selectedAddressId === 'new' || (!!user && !addressQuery.isLoading && !addressQuery.data?.length);
  const shippingAddress = selectedAddress
    ? [selectedAddress.street, selectedAddress.ward, selectedAddress.district, selectedAddress.province].filter(Boolean).join(', ')
    : [street.trim(), location.ward?.name, location.district?.name, location.province?.name].filter(Boolean).join(', ');

  const validateCurrentCoupon = useCallback((codeValue: string) => {
    const code = codeValue.trim().toUpperCase();
    if (!code || !cart.data?.items.length) return;
    if (hasUnpricedCartItem) { setCouponError('Không thể áp dụng mã khi giỏ hàng có sản phẩm cần dược sĩ tư vấn.'); return; }
    coupon.mutate({ code, items: cart.data.items.map((item) => ({ medicineId: item.medicineId, quantity: item.quantity })) });
  }, [cart.data?.items, coupon, hasUnpricedCartItem]);

  useEffect(() => {
    const initialCode = typeof params.couponCode === 'string' ? params.couponCode.trim().toUpperCase() : '';
    if (!initialCode || !cart.data?.items.length || autoValidatedCode.current === initialCode) return;
    autoValidatedCode.current = initialCode;
    validateCurrentCoupon(initialCode);
  }, [cart.data?.items, params.couponCode, validateCurrentCoupon]);

  const applyCoupon = () => {
    setError(null);
    if (!user) { setCouponError('Đăng nhập để kiểm tra và sử dụng mã giảm giá.'); return; }
    validateCurrentCoupon(couponCode);
  };

  const persistNewAddress = () => {
    if (!receiverName.trim() || !receiverPhone.trim()) {
      setAddressError('Nhập tên và số điện thoại người nhận trước khi lưu địa chỉ.');
      return;
    }
    if (!street.trim() || !location.province || !location.district || !location.ward) {
      setAddressError('Nhập số nhà, tên đường và chọn đầy đủ tỉnh/thành, quận/huyện, phường/xã.');
      return;
    }
    const input: AddressInput = {
      receiverName: receiverName.trim(),
      phone: receiverPhone.trim(),
      street: street.trim(),
      ward: location.ward.name,
      district: location.district.name,
      province: location.province.name,
      isDefault: !addressQuery.data?.length,
    };
    setAddressError(null);
    saveAddress.mutate(input);
  };

  const submit = () => {
    if (hasUnpricedCartItem) { setError('Giỏ hàng có sản phẩm chưa niêm yết giá. Vui lòng trao đổi với dược sĩ trước khi mua.'); return; }
    if (enteringNewAddress && (!street.trim() || !location.province || !location.district || !location.ward)) { setError('Vui lòng nhập địa chỉ chi tiết và chọn tỉnh/thành, quận/huyện, phường/xã.'); return; }
    if (!receiverName.trim() || !receiverPhone.trim() || !shippingAddress.trim()) { setError('Vui lòng nhập đầy đủ thông tin người nhận và địa chỉ giao hàng.'); return; }
    if (!cart.data?.items.length) { setError('Giỏ hàng đang trống.'); return; }
    setError(null);
    order.mutate({ items: cart.data.items.map((item) => ({ medicineId: item.medicineId, quantity: item.quantity })), receiverName: receiverName.trim(), receiverPhone: receiverPhone.trim(), shippingAddress: shippingAddress.trim(), paymentMethod, ...(couponCode.trim() ? { couponCode: couponCode.trim().toUpperCase() } : {}) });
  };

  return <ThemedView style={styles.page}><SafeAreaView style={styles.safe} edges={['top', 'bottom']}><AppHeader /><ScrollView alwaysBounceVertical refreshControl={<RefreshControl refreshing={pullRefresh.refreshing} onRefresh={() => void pullRefresh.onRefresh()} tintColor={theme.tint} colors={[theme.tint]} />} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <ThemedText style={styles.title}>Thông tin giao hàng</ThemedText>
    {hasUnpricedCartItem ? <ThemedText accessibilityRole="alert" themeColor="textSecondary" style={styles.addressError}>Giỏ hàng có sản phẩm cần dược sĩ tư vấn, chưa thể đặt hàng.</ThemedText> : null}
    {authLoading || cart.isLoading ? <LoadingIndicator size={60} color={theme.tint} /> : !user ? <View style={styles.notice}><ThemedText themeColor="textSecondary">Đăng nhập để tiếp tục đặt hàng.</ThemedText><Link href="/auth/login" style={{ color: theme.tint, fontWeight: '700', marginTop: 10 }}>Đăng nhập</Link></View> : cart.error ? <ThemedText style={styles.error}>{cart.error instanceof ApiError ? cart.error.message : 'Không tải được giỏ hàng.'}</ThemedText> : !cart.data?.items.length ? <View style={styles.notice}><ThemedText themeColor="textSecondary">Giỏ hàng đang trống.</ThemedText><Link href="/" style={{ color: theme.tint, marginTop: 10 }}>Khám phá sản phẩm</Link></View> : <>
      <ThemedText style={styles.label}>Mã giảm giá</ThemedText>
      <View style={styles.couponRow}>
        <TextInput value={couponCode} onChangeText={(value) => { setCouponCode(value); setCouponPreview(null); setCouponError(null); }} autoCapitalize="characters" autoCorrect={false} accessibilityLabel="Mã giảm giá" placeholder="Nhập mã ưu đãi nếu có" placeholderTextColor={theme.textSecondary} style={[styles.input, styles.couponInput, { color: theme.text, borderColor: theme.backgroundSelected }]} />
        <Pressable accessibilityRole="button" disabled={!couponCode.trim() || coupon.isPending || hasUnpricedCartItem} onPress={applyCoupon} style={[styles.couponButton, { backgroundColor: theme.tint, opacity: !couponCode.trim() || coupon.isPending || hasUnpricedCartItem ? 0.55 : 1 }]}>
          <ThemedText style={styles.couponButtonText}>{coupon.isPending ? 'Đang kiểm tra…' : 'Áp dụng'}</ThemedText>
        </Pressable>
      </View>
      {couponError ? <ThemedText accessibilityRole="alert" style={styles.error}>{couponError}</ThemedText> : couponPreview && couponPreview.code === couponCode.trim().toUpperCase() ? <ThemedText style={[styles.couponHint, { color: theme.tint }]}>{`Đã áp dụng ${couponPreview.code}: giảm ${money.format(Number(couponPreview.discountAmount))}`}</ThemedText> : <ThemedText themeColor="textSecondary" style={styles.couponHint}>Áp dụng để xem số tiền được giảm. Máy chủ sẽ kiểm tra lại khi đặt hàng.</ThemedText>}
      <ThemedText style={styles.label}>Tên người nhận</ThemedText><TextInput value={receiverName} onChangeText={setReceiverName} accessibilityLabel="Tên người nhận" placeholder="Họ và tên" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]} />
      <ThemedText style={styles.label}>Số điện thoại</ThemedText><TextInput value={receiverPhone} onChangeText={setReceiverPhone} keyboardType="phone-pad" accessibilityLabel="Số điện thoại người nhận" placeholder="Số điện thoại" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]} />
      <ThemedText style={styles.sectionTitle}>Địa chỉ giao hàng</ThemedText>
      {addressQuery.isLoading ? <LoadingIndicator size={60} color={theme.tint} /> : addressQuery.error ? <View style={styles.addressError}><ThemedText style={styles.error}>{addressQuery.error instanceof ApiError ? addressQuery.error.message : 'Không tải được địa chỉ đã lưu.'}</ThemedText><Pressable accessibilityRole="button" onPress={() => void addressQuery.refetch()}><ThemedText style={{ color: theme.tint, marginTop: 8 }}>Thử tải lại</ThemedText></Pressable></View> : addressQuery.data?.map((address) => {
        const chosen = selectedAddressId === address.id;
        return <Pressable key={address.id} accessibilityRole="radio" accessibilityState={{ checked: chosen }} onPress={() => selectAddress(address)} style={[styles.savedAddress, { borderColor: chosen ? theme.tint : theme.backgroundSelected, backgroundColor: chosen ? theme.backgroundSelected : theme.background }]}>
          <View style={styles.savedAddressHeading}><ThemedText style={styles.savedAddressName}>{address.receiverName}</ThemedText>{address.isDefault ? <ThemedText style={[styles.defaultTag, { color: theme.tint }]}>Mặc định</ThemedText> : null}</View>
          <ThemedText themeColor="textSecondary" style={styles.savedAddressMeta}>{address.phone}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.savedAddressMeta}>{[address.street, address.ward, address.district, address.province].filter(Boolean).join(', ')}</ThemedText>
        </Pressable>;
      })}
      <Pressable accessibilityRole="button" accessibilityState={{ selected: enteringNewAddress }} onPress={() => { setSelectedAddressId('new'); setAddressError(null); setStreet(''); setLocation({ province: null, district: null, ward: null }); }} style={styles.newAddressButton}>
        <ThemedText style={{ color: theme.tint, fontWeight: '700' }}>{addressQuery.data?.length ? '+ Nhập địa chỉ mới' : 'Nhập địa chỉ giao hàng mới'}</ThemedText>
      </Pressable>
      {enteringNewAddress ? <>
        <ThemedText style={styles.label}>Số nhà, tên đường</ThemedText>
        <TextInput value={street} onChangeText={setStreet} accessibilityLabel="Số nhà và tên đường" placeholder="Ví dụ: 12 Nguyễn Trãi" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]} />
        <VietnamAddressFields value={location} onChange={setLocation} />
        <Pressable accessibilityRole="button" disabled={saveAddress.isPending || !street.trim() || !location.province || !location.district || !location.ward} onPress={persistNewAddress} style={[styles.saveAddressButton, { borderColor: theme.tint, opacity: saveAddress.isPending || !street.trim() || !location.province || !location.district || !location.ward ? 0.5 : 1 }]}>
          {saveAddress.isPending ? <LoadingIndicator size="small" color={theme.tint} /> : <ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Lưu địa chỉ vào tài khoản</ThemedText>}
        </Pressable>
      </> : null}
      {addressError ? <ThemedText accessibilityRole="alert" style={styles.error}>{addressError}</ThemedText> : null}
      <View style={[styles.payment, { backgroundColor: theme.backgroundElement }]}><ThemedText style={styles.label}>Phương thức thanh toán</ThemedText>
        {([{ value: 'COD', label: 'Thanh toán khi nhận hàng (COD)' }, { value: 'PAYOS', label: 'Thanh toán trực tuyến qua PayOS' }] as const).map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: paymentMethod === option.value }} onPress={() => setPaymentMethod(option.value)} style={[styles.paymentOption, { borderColor: paymentMethod === option.value ? theme.tint : theme.backgroundSelected }]}><View style={[styles.radio, { borderColor: paymentMethod === option.value ? theme.tint : theme.textSecondary }]}>{paymentMethod === option.value ? <View style={[styles.radioDot, { backgroundColor: theme.tint }]} /> : null}</View><ThemedText style={styles.paymentLabel}>{option.label}</ThemedText></Pressable>)}
      </View>
      {cart.data ? <View style={[styles.orderSummary, { borderTopColor: theme.backgroundSelected }]}>
        <ThemedText style={styles.sectionTitle}>Tóm tắt thanh toán</ThemedText>
        <View style={styles.summaryRow}><ThemedText themeColor="textSecondary">Tạm tính</ThemedText><ThemedText>{money.format(Number(couponPreview?.subtotalAmount ?? cart.data.subtotal ?? cart.data.items.reduce((sum, item) => sum + Number(item.lineTotal ?? 0), 0)))}</ThemedText></View>
        {couponPreview && couponPreview.code === couponCode.trim().toUpperCase() ? <View style={styles.summaryRow}><ThemedText themeColor="textSecondary">Gift code ({couponPreview.code})</ThemedText><ThemedText style={{ color: theme.tint }}>− {money.format(Number(couponPreview.discountAmount))}</ThemedText></View> : null}
        <View style={styles.summaryRow}><ThemedText themeColor="textSecondary" style={styles.summaryLabel}>Phí giao hàng</ThemedText><ThemedText numberOfLines={1} themeColor="textSecondary" style={[styles.summaryValue, styles.deliveryValue]}>Miễn phí</ThemedText></View>
        <View style={[styles.totalRow, { borderTopColor: theme.backgroundSelected }]}><ThemedText style={styles.totalLabel}>Tổng cộng</ThemedText><ThemedText style={[styles.totalValue, { color: theme.tint }]}>{money.format(Number(couponPreview && couponPreview.code === couponCode.trim().toUpperCase() ? couponPreview.totalAmount : cart.data.subtotal ?? cart.data.items.reduce((sum, item) => sum + Number(item.lineTotal ?? 0), 0)))}</ThemedText></View>
      </View> : null}
      {error ? <ThemedText accessibilityRole="alert" style={styles.error}>{error}</ThemedText> : null}
      <Pressable accessibilityRole="button" disabled={order.isPending || !cart.data?.items.length || hasUnpricedCartItem} onPress={submit} style={[styles.submit, { backgroundColor: hasUnpricedCartItem ? theme.textSecondary : theme.tint, opacity: order.isPending || !cart.data?.items.length || hasUnpricedCartItem ? 0.6 : 1 }]}>{order.isPending ? <LoadingIndicator color="#FFFFFF" /> : <ThemedText style={styles.submitText}>{hasUnpricedCartItem ? 'Cần dược sĩ tư vấn · Không thể mua' : 'Xác nhận đặt hàng'}</ThemedText>}</Pressable>
    </>}
  </ScrollView></SafeAreaView></ThemedView>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, safe: { flex: 1 }, content: { padding: 20, paddingBottom: 32 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 14 },
  label: { fontSize: 14, fontWeight: '700', marginTop: 16, marginBottom: 7 },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginTop: 24, marginBottom: 10 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 15 },
  couponRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  couponInput: { flex: 1, minWidth: 0 },
  couponButton: { minHeight: 50, paddingHorizontal: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  couponButtonText: { color: '#FFFFFF', fontWeight: '700' },
  couponHint: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  orderSummary: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 24, paddingTop: 18 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 12 },
  summaryLabel: { flex: 1, minWidth: 0 },
  summaryValue: { flexShrink: 0, textAlign: 'right' },
  deliveryValue: { minWidth: 72 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, marginTop: 3 },
  totalLabel: { fontSize: 16, fontWeight: '800' },
  totalValue: { fontSize: 19, fontWeight: '800' },
  addressError: { paddingVertical: 8 },
  savedAddress: { padding: 13, borderWidth: 1, borderRadius: 13, marginBottom: 9 },
  savedAddressHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  savedAddressName: { flex: 1, fontSize: 14, fontWeight: '700' },
  defaultTag: { fontSize: 11, fontWeight: '700' },
  savedAddressMeta: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  newAddressButton: { minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' },
  saveAddressButton: { minHeight: 46, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  payment: { marginTop: 22, padding: 15, borderRadius: 13 }, paymentOption: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 11, padding: 12, marginTop: 9 }, radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' }, radioDot: { width: 9, height: 9, borderRadius: 5 }, paymentLabel: { flex: 1, fontSize: 13 },
  notice: { padding: 18, borderRadius: 15 },
  error: { color: '#B42318', marginTop: 14 },
  submit: { minHeight: 52, borderRadius: 13, marginTop: 23, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});

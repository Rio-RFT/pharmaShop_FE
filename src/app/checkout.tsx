import { LoadingIndicator } from '@/shared/components/loading-indicator';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/features/auth/auth-provider';
import { clearCart, getCart } from '@/features/cart/api/cart';
import { createOrder, createPayOSLink } from '@/features/orders/api/orders';
import { savePendingPayOSOrder } from '@/features/payments/pending-order';
import { ApiError } from '@/shared/api/client';
import { useTheme } from '@/hooks/use-theme';
import { AppHeader } from '@/components/app-header';
import { getAddresses, createAddress, type Address, type AddressInput } from '@/features/profile/api/addresses';
import { VietnamAddressFields } from '@/features/checkout/components/vietnam-address-fields';
import type { DivisionOption } from '@/features/checkout/api/vietnam-provinces';

export default function CheckoutScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ couponCode?: string | string[] }>();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const cart = useQuery({ queryKey: ['cart'], queryFn: getCart, enabled: !!user });
  const addressQuery = useQuery({ queryKey: ['addresses', user?.id], queryFn: getAddresses, enabled: !!user });
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [street, setStreet] = useState('');
  const [location, setLocation] = useState<{ province: DivisionOption | null; district: DivisionOption | null; ward: DivisionOption | null }>({ province: null, district: null, ward: null });
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState(typeof params.couponCode === 'string' ? params.couponCode : '');
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'PAYOS'>('COD');
  const order = useMutation({ mutationFn: createOrder, onSuccess: async (createdOrder) => {
    try { const emptied = await clearCart(); queryClient.setQueryData(['cart'], emptied); }
    catch { await queryClient.invalidateQueries({ queryKey: ['cart'] }); }
    await queryClient.invalidateQueries({ queryKey: ['orders'] });
    if (createdOrder.paymentMethod === 'PAYOS') {
      try {
        const payos = await createPayOSLink(createdOrder.id);
        const checkout = new URL(payos.checkoutUrl);
        if (checkout.protocol !== 'https:' || !(checkout.hostname === 'pay.payos.vn' || checkout.hostname.endsWith('.payos.vn'))) throw new Error('Đường dẫn thanh toán không hợp lệ.');
        await savePendingPayOSOrder(createdOrder.id);
        await WebBrowser.openBrowserAsync(checkout.toString());
      } catch (reason) {
        setError(reason instanceof ApiError ? reason.message : 'Không mở được PayOS. Đơn hàng đã tạo và vẫn chờ thanh toán.');
      }
    }
    router.replace({ pathname: '/order/[id]', params: { id: createdOrder.id } });
  }, onError: (reason) => setError(reason instanceof ApiError ? reason.message : 'Không tạo được đơn hàng.') });
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
    if (enteringNewAddress && (!street.trim() || !location.province || !location.district || !location.ward)) { setError('Vui lòng nhập địa chỉ chi tiết và chọn tỉnh/thành, quận/huyện, phường/xã.'); return; }
    if (!receiverName.trim() || !receiverPhone.trim() || !shippingAddress.trim()) { setError('Vui lòng nhập đầy đủ thông tin người nhận và địa chỉ giao hàng.'); return; }
    if (!cart.data?.items.length) { setError('Giỏ hàng đang trống.'); return; }
    setError(null);
    order.mutate({ items: cart.data.items.map((item) => ({ medicineId: item.medicineId, quantity: item.quantity })), receiverName: receiverName.trim(), receiverPhone: receiverPhone.trim(), shippingAddress: shippingAddress.trim(), paymentMethod, ...(couponCode.trim() ? { couponCode: couponCode.trim().toUpperCase() } : {}) });
  };

  return <ThemedView style={styles.page}><SafeAreaView style={styles.safe} edges={['top', 'bottom']}><AppHeader /><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <ThemedText style={styles.title}>Thông tin giao hàng</ThemedText>
    {authLoading || cart.isLoading ? <LoadingIndicator size={60} color={theme.tint} /> : !user ? <View style={styles.notice}><ThemedText themeColor="textSecondary">Đăng nhập để tiếp tục đặt hàng.</ThemedText><Link href="/auth/login" style={{ color: theme.tint, fontWeight: '700', marginTop: 10 }}>Đăng nhập</Link></View> : cart.error ? <ThemedText style={styles.error}>{cart.error instanceof ApiError ? cart.error.message : 'Không tải được giỏ hàng.'}</ThemedText> : !cart.data?.items.length ? <View style={styles.notice}><ThemedText themeColor="textSecondary">Giỏ hàng đang trống.</ThemedText><Link href="/" style={{ color: theme.tint, marginTop: 10 }}>Khám phá sản phẩm</Link></View> : <>
      <ThemedText style={styles.label}>Mã giảm giá</ThemedText>
      <TextInput value={couponCode} onChangeText={setCouponCode} autoCapitalize="characters" autoCorrect={false} accessibilityLabel="Mã giảm giá" placeholder="Nhập mã ưu đãi nếu có" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]} />
      <ThemedText themeColor="textSecondary" style={styles.couponHint}>Mã được xác minh khi đặt hàng. Mức giảm do máy chủ tính theo điều kiện áp dụng.</ThemedText>
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
      {error ? <ThemedText accessibilityRole="alert" style={styles.error}>{error}</ThemedText> : null}
      <Pressable accessibilityRole="button" disabled={order.isPending || !cart.data?.items.length} onPress={submit} style={[styles.submit, { backgroundColor: theme.tint, opacity: order.isPending || !cart.data?.items.length ? 0.6 : 1 }]}>{order.isPending ? <LoadingIndicator color="#FFFFFF" /> : <ThemedText style={styles.submitText}>Xác nhận đặt hàng</ThemedText>}</Pressable>
    </>}
  </ScrollView></SafeAreaView></ThemedView>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, safe: { flex: 1 }, content: { padding: 20, paddingBottom: 32 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 14 },
  label: { fontSize: 14, fontWeight: '700', marginTop: 16, marginBottom: 7 },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginTop: 24, marginBottom: 10 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 15 },
  couponHint: { fontSize: 12, lineHeight: 18, marginTop: 6 },
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

import { LoadingIndicator } from '@/shared/components/loading-indicator';
import { Link, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Image } from 'expo-image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/app-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/features/auth/auth-provider';
import { getCart, removeCartItem, setCartItemQuantity, type Cart, type CartItem } from '@/features/cart/api/cart';
import { ApiError } from '@/shared/api/client';

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

export default function CartScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, loading: authLoading, guestItems, guestCartSyncError, setGuestQuantity, removeGuestItem, retryGuestCartSync } = useAuth();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const cart = useQuery({ queryKey: ['cart'], queryFn: getCart, enabled: !!user, refetchOnWindowFocus: true });
  const update = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) => quantity < 1 ? removeCartItem(id) : setCartItemQuantity(id, quantity),
    onSuccess: (data) => { queryClient.setQueryData<Cart>(['cart'], data); setActionError(null); },
    onError: (error) => setActionError(error instanceof ApiError ? error.message : 'Không cập nhật được giỏ hàng.'),
  });
  const remove = useMutation({
    mutationFn: removeCartItem,
    onSuccess: (data) => { queryClient.setQueryData<Cart>(['cart'], data); setActionError(null); },
    onError: (error) => setActionError(error instanceof ApiError ? error.message : 'Không xóa được sản phẩm.'),
  });

  const items: { item: CartItem; guest: boolean }[] = [
    ...(cart.data?.items ?? []).map((item) => ({ item, guest: false })),
    ...guestItems.map((entry) => ({
      guest: true,
      item: {
        id: `guest-${entry.medicine.id}`,
        medicineId: entry.medicine.id,
        quantity: entry.quantity,
        lineTotal: Number(entry.medicine.price) * entry.quantity,
        medicine: entry.medicine,
      },
    })),
  ];
  const subtotal = items.reduce((total, { item }) => total + Number(item.lineTotal), 0);
  const busy = update.isPending || remove.isPending;

  const changeQuantity = (item: CartItem, guest: boolean, quantity: number) => {
    if (guest) setGuestQuantity(item.medicineId, quantity);
    else update.mutate({ id: item.medicineId, quantity });
  };
  const removeItem = (item: CartItem, guest: boolean) => {
    if (guest) removeGuestItem(item.medicineId);
    else remove.mutate(item.medicineId);
  };

  const loading = authLoading || (!!user && cart.isLoading);
  const loadError = user && cart.error;

  return (
    <ThemedView style={styles.page}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppHeader />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.pageHeading}>
            <View>
              <ThemedText style={styles.title}>Giỏ hàng</ThemedText>
              {!loading && !loadError ? <ThemedText themeColor="textSecondary" style={styles.subtitle}>{items.length} sản phẩm</ThemedText> : null}
            </View>
          </View>

          {loading ? (
            <View style={styles.state}><LoadingIndicator size={60} color={theme.tint} /><ThemedText themeColor="textSecondary" style={styles.stateText}>Đang tải giỏ hàng…</ThemedText></View>
          ) : loadError ? (
            <View style={[styles.state, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={styles.stateTitle}>Chưa tải được giỏ hàng</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.stateText}>{cart.error instanceof ApiError ? cart.error.message : 'Đã xảy ra lỗi khi kết nối.'}</ThemedText>
              <Pressable accessibilityRole="button" onPress={() => void cart.refetch()} style={[styles.secondaryButton, { borderColor: theme.backgroundSelected }]}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Thử lại</ThemedText></Pressable>
            </View>
          ) : items.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundSelected }]}><SymbolView name={{ ios: 'cart', android: 'shopping_cart', web: 'shopping_cart' }} size={27} tintColor={theme.tint} /></View>
              <ThemedText style={styles.stateTitle}>Giỏ hàng đang trống</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.emptyCopy}>Sản phẩm bạn chọn sẽ xuất hiện ở đây.</ThemedText>
              <Link href="/" style={[styles.shopButton, { backgroundColor: theme.tint }]}>Khám phá sản phẩm</Link>
            </View>
          ) : (
            <>
              {!user ? <ThemedText themeColor="textSecondary" style={styles.guestNote}>Giỏ hàng tạm sẽ được gộp vào tài khoản sau khi bạn đăng nhập.</ThemedText> : null}

              <View style={styles.itemList}>
                {items.map(({ item, guest }) => (
                  <View key={`${item.medicineId}-${guest ? 'guest' : 'user'}`} style={[styles.item, { backgroundColor: theme.backgroundElement }]}>
                    <View style={[styles.imageBox, { backgroundColor: theme.background }]}>
                      {item.medicine.imageUrl ? (
                        <Image source={{ uri: item.medicine.imageUrl }} style={styles.productImage} contentFit="contain" transition={150} />
                      ) : (
                        <SymbolView name={{ ios: 'cross.case', android: 'medical_services', web: 'medical_services' }} size={28} tintColor={theme.textSecondary} />
                      )}
                    </View>
                    <View style={styles.itemBody}>
                      <View style={styles.itemHeading}>
                        <ThemedText numberOfLines={2} style={styles.itemName}>{item.medicine.name}</ThemedText>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Xóa ${item.medicine.name} khỏi giỏ hàng`} disabled={busy} onPress={() => removeItem(item, guest)} hitSlop={8} style={styles.removeButton}>
                          <SymbolView name={{ ios: 'trash', android: 'delete_outline', web: 'delete_outline' }} size={18} tintColor={theme.textSecondary} />
                        </Pressable>
                      </View>
                      <ThemedText numberOfLines={1} themeColor="textSecondary" style={styles.packaging}>{item.medicine.packaging || item.medicine.unit}</ThemedText>
                      {guest && user ? <ThemedText themeColor="textSecondary" style={styles.syncText}>Đang chờ đồng bộ</ThemedText> : null}
                      <View style={styles.itemFooter}>
                        <View>
                          <ThemedText themeColor="textSecondary" style={styles.unitPrice}>{money.format(Number(item.medicine.price))} / {item.medicine.unit}</ThemedText>
                          <ThemedText style={[styles.lineTotal, { color: theme.tint }]}>{money.format(Number(item.lineTotal))}</ThemedText>
                        </View>
                        <View style={[styles.quantityControl, { backgroundColor: theme.background }]}>
                          <Pressable accessibilityRole="button" accessibilityLabel={`Giảm số lượng ${item.medicine.name}`} disabled={busy} onPress={() => changeQuantity(item, guest, item.quantity - 1)} hitSlop={6} style={styles.quantityButton}>
                            <ThemedText style={[styles.quantitySymbol, { color: theme.textSecondary }]}>−</ThemedText>
                          </Pressable>
                          <ThemedText accessibilityLabel={`Số lượng ${item.quantity}`} style={styles.quantity}>{item.quantity}</ThemedText>
                          <Pressable accessibilityRole="button" accessibilityLabel={`Tăng số lượng ${item.medicine.name}`} disabled={busy} onPress={() => changeQuantity(item, guest, item.quantity + 1)} hitSlop={6} style={styles.quantityButton}>
                            <ThemedText style={[styles.quantitySymbol, { color: theme.tint }]}>+</ThemedText>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              {actionError ? <ThemedText accessibilityRole="alert" style={styles.error}>{actionError}</ThemedText> : null}
              {guestCartSyncError ? <View style={[styles.syncNotice, { backgroundColor: theme.backgroundElement }]}><ThemedText style={styles.error}>{guestCartSyncError}</ThemedText><Pressable accessibilityRole="button" disabled={busy} onPress={() => void retryGuestCartSync()}><ThemedText style={{ color: theme.tint, fontWeight: '700', marginTop: 8 }}>Đồng bộ lại</ThemedText></Pressable></View> : null}

              <View style={[styles.couponSection, { borderTopColor: theme.backgroundSelected }]}>
                <ThemedText style={styles.summaryHeading}>Mã giảm giá</ThemedText>
                <View style={styles.couponRow}>
                  <TextInput
                    accessibilityLabel="Mã giảm giá"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!couponCode}
                    onChangeText={setCouponInput}
                    placeholder="Nhập mã ưu đãi"
                    placeholderTextColor={theme.textSecondary}
                    returnKeyType="done"
                    value={couponInput}
                    style={[styles.couponInput, { color: theme.text, borderColor: theme.backgroundSelected, backgroundColor: theme.background }]}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={couponCode ? 'Bỏ mã giảm giá' : 'Dùng mã giảm giá'}
                    disabled={!couponCode && !couponInput.trim()}
                    onPress={() => {
                      if (couponCode) { setCouponCode(''); setCouponInput(''); }
                      else setCouponCode(couponInput.trim().toUpperCase());
                    }}
                    style={[styles.couponButton, { backgroundColor: couponCode ? theme.backgroundSelected : theme.tint, opacity: !couponCode && !couponInput.trim() ? 0.5 : 1 }]}
                  >
                    <ThemedText style={{ color: couponCode ? theme.text : '#FFFFFF', fontWeight: '700' }}>{couponCode ? 'Bỏ mã' : 'Dùng mã'}</ThemedText>
                  </Pressable>
                </View>
                <ThemedText themeColor="textSecondary" style={styles.couponHint}>
                  {couponCode ? `Đã chọn ${couponCode}. Mã và mức giảm sẽ được máy chủ xác minh khi đặt hàng.` : 'Mã giảm giá được xác minh khi bạn đặt hàng.'}
                </ThemedText>
              </View>

              <View style={[styles.summary, { borderTopColor: theme.backgroundSelected }]}>
                <ThemedText style={styles.summaryHeading}>Tóm tắt đơn hàng</ThemedText>
                <View style={styles.summaryRow}><ThemedText themeColor="textSecondary">Tạm tính ({items.reduce((total, entry) => total + entry.item.quantity, 0)} sản phẩm)</ThemedText><ThemedText style={styles.summaryValue}>{money.format(subtotal)}</ThemedText></View>
                <View style={styles.summaryRow}><ThemedText themeColor="textSecondary">Phí giao hàng</ThemedText><ThemedText themeColor="textSecondary" style={styles.summaryValue}>Tính khi đặt hàng</ThemedText></View>
                <View style={[styles.totalRow, { borderTopColor: theme.backgroundSelected }]}><ThemedText style={styles.totalLabel}>Tổng cộng</ThemedText><ThemedText style={[styles.totalValue, { color: theme.tint }]}>{money.format(subtotal)}</ThemedText></View>
                {!user ? <ThemedText themeColor="textSecondary" style={styles.loginHint}>Bạn cần đăng nhập để tiếp tục thanh toán.</ThemedText> : null}
                <Pressable accessibilityRole="button" onPress={() => user ? router.push({ pathname: '/checkout', params: { couponCode: couponCode || undefined } }) : router.push('/auth/login')} style={[styles.checkoutButton, { backgroundColor: theme.tint }]}>
                  <ThemedText style={styles.checkoutButtonText}>{user ? 'Tiến hành thanh toán' : 'Đăng nhập để thanh toán'}</ThemedText>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  safe: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 36 },
  pageHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 3 },
  state: { alignItems: 'center', padding: 24, borderRadius: 18, marginTop: 8 },
  stateText: { textAlign: 'center', marginTop: 8, lineHeight: 20 },
  stateTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  secondaryButton: { minHeight: 42, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  emptyState: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 32, borderRadius: 20, marginTop: 8 },
  emptyIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyCopy: { textAlign: 'center', marginTop: 7, lineHeight: 20 },
  shopButton: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 18, paddingVertical: 13, borderRadius: 12, marginTop: 20 },
  guestNote: { marginTop: -8, marginBottom: 14, fontSize: 13, lineHeight: 19 },
  itemList: { gap: 12 },
  item: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, borderRadius: 18, gap: 12 },
  imageBox: { width: 78, height: 88, borderRadius: 13, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  productImage: { width: '90%', height: '90%' },
  itemBody: { flex: 1, minWidth: 0 },
  itemHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  itemName: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '700' },
  removeButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', marginTop: -5, marginRight: -5 },
  packaging: { fontSize: 12, marginTop: 3 },
  syncText: { fontSize: 11, marginTop: 3 },
  itemFooter: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6, marginTop: 12 },
  unitPrice: { fontSize: 10, lineHeight: 14 },
  lineTotal: { fontSize: 14, lineHeight: 19, fontWeight: '800', marginTop: 2 },
  quantityControl: { flexDirection: 'row', alignItems: 'center', height: 34, borderRadius: 11 },
  quantityButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  quantitySymbol: { fontSize: 19, fontWeight: '600', lineHeight: 23 },
  quantity: { minWidth: 20, textAlign: 'center', fontSize: 13, fontWeight: '700' },
  error: { color: '#B42318', marginTop: 12 },
  syncNotice: { padding: 14, borderRadius: 14, marginTop: 14 },
  couponSection: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 22, paddingTop: 18 },
  couponRow: { flexDirection: 'row', gap: 9 },
  couponInput: { flex: 1, minWidth: 0, height: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, fontSize: 14 },
  couponButton: { minWidth: 82, height: 48, paddingHorizontal: 13, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  couponHint: { fontSize: 11, lineHeight: 16, marginTop: 7 },
  summary: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 22, paddingTop: 18 },
  summaryHeading: { fontSize: 16, fontWeight: '800', marginBottom: 13 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 12 },
  summaryValue: { fontSize: 13, fontWeight: '600' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, marginTop: 3 },
  totalLabel: { fontSize: 15, fontWeight: '700' },
  totalValue: { fontSize: 19, fontWeight: '800' },
  loginHint: { marginTop: 11, fontSize: 12 },
  checkoutButton: { alignItems: 'center', justifyContent: 'center', minHeight: 52, paddingVertical: 13, borderRadius: 14, marginTop: 15 },
  checkoutButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});

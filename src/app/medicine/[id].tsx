import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ElementRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getMedicine, type Medicine } from '@/features/catalog/api/medicines';
import { ApiError } from '@/shared/api/client';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/features/auth/auth-provider';
import { addCartItem } from '@/features/cart/api/cart';
import { AppHeader } from '@/components/app-header';
import { useCartFlight } from '@/components/cart-flight-provider';

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

export default function MedicineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { user, addGuestItem } = useAuth();
  const queryClient = useQueryClient();
  const imageRef = useRef<ElementRef<typeof View> | null>(null);
  const { flyToCart } = useCartFlight();
  const [guestAdded, setGuestAdded] = useState(false);
  const addToCart = useMutation({ mutationFn: () => addCartItem(id, 1), onSuccess: (cart) => { queryClient.setQueryData(['cart'], cart); } });
  const [medicine, setMedicine] = useState<Medicine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getMedicine(id)
      .then((data) => { if (active) setMedicine(data); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof ApiError ? reason.message : 'Không tải được thông tin sản phẩm.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const addItem = () => {
    if (!medicine) return;
    if (user) addToCart.mutate(undefined, { onSuccess: () => flyToCart(medicine.imageUrl ?? null, imageRef.current) });
    else { addGuestItem(medicine); setGuestAdded(true); flyToCart(medicine.imageUrl ?? null, imageRef.current); }
  };

  return <ThemedView style={styles.page}><SafeAreaView style={styles.safe} edges={['top', 'bottom']}><AppHeader />
    {loading ? <View style={styles.center}><ActivityIndicator color={theme.tint} /><ThemedText themeColor="textSecondary" style={styles.state}>Đang tải thông tin…</ThemedText></View> : error ? <View style={styles.center}><ThemedText style={styles.error}>{error}</ThemedText><Pressable accessibilityRole="button" onPress={() => { setError(null); setLoading(true); void getMedicine(id).then(setMedicine).catch((reason: unknown) => setError(reason instanceof ApiError ? reason.message : 'Không tải được thông tin sản phẩm.')).finally(() => setLoading(false)); }}><ThemedText style={{ color: theme.tint, marginTop: 12 }}>Thử lại</ThemedText></Pressable></View> : medicine ? <ScrollView contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>‹  Quay lại</ThemedText></Pressable>
      <View ref={imageRef} collapsable={false} style={styles.imageFrame}>{medicine.imageUrl ? <Image source={{ uri: medicine.imageUrl }} style={styles.image} contentFit="contain" /> : <View style={[styles.image, styles.imagePlaceholder, { backgroundColor: theme.backgroundElement }]}><ThemedText style={{ color: theme.tint, fontSize: 28, fontWeight: '700' }}>Rx</ThemedText></View>}</View>
      <ThemedText themeColor="textSecondary" style={styles.category}>{medicine.category}</ThemedText><ThemedText style={styles.name}>{medicine.name}</ThemedText><ThemedText themeColor="textSecondary" style={styles.body}>{medicine.activeIngredient}</ThemedText>
      <ThemedText style={[styles.price, { color: theme.tint }]}>{money.format(Number(medicine.price))}</ThemedText><ThemedText themeColor="textSecondary" style={styles.body}>{medicine.packaging}</ThemedText><ThemedText style={styles.label}>Tình trạng tồn kho</ThemedText><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Còn hàng</ThemedText>
      {medicine.indications ? <><ThemedText style={styles.label}>Thông tin sản phẩm</ThemedText><ThemedText themeColor="textSecondary" style={styles.body}>{medicine.indications}</ThemedText></> : null}
      {medicine.dosage ? <><ThemedText style={styles.label}>Liều dùng</ThemedText><ThemedText themeColor="textSecondary" style={styles.body}>{medicine.dosage}</ThemedText></> : null}
      {medicine.contraindications ? <><ThemedText style={styles.label}>Chống chỉ định</ThemedText><ThemedText themeColor="textSecondary" style={styles.body}>{medicine.contraindications}</ThemedText></> : null}
      {medicine.sideEffects ? <><ThemedText style={styles.label}>Tác dụng không mong muốn</ThemedText><ThemedText themeColor="textSecondary" style={styles.body}>{medicine.sideEffects}</ThemedText></> : null}
      {medicine.manufacturer ? <><ThemedText style={styles.label}>Nhà sản xuất</ThemedText><ThemedText themeColor="textSecondary" style={styles.body}>{medicine.manufacturer}</ThemedText></> : null}
      <Pressable accessibilityRole="button" disabled={addToCart.isPending} onPress={addItem} style={[styles.addButton, { backgroundColor: theme.tint, opacity: addToCart.isPending ? 0.6 : 1 }]}>{addToCart.isPending ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.addButtonText}>{guestAdded ? 'Đã thêm vào giỏ hàng' : 'Thêm vào giỏ hàng'}</ThemedText>}</Pressable>
      {addToCart.error ? <ThemedText accessibilityRole="alert" style={styles.error}>{addToCart.error instanceof ApiError ? addToCart.error.message : 'Không thêm được vào giỏ hàng.'}</ThemedText> : null}
      <ThemedText style={styles.disclaimer}>Thông tin do nhà thuốc cung cấp. Vui lòng đọc kỹ hướng dẫn sử dụng.</ThemedText>
    </ScrollView> : null}
  </SafeAreaView></ThemedView>;
}

const styles = StyleSheet.create({ page: { flex: 1 }, safe: { flex: 1 }, content: { paddingHorizontal: 20, paddingBottom: 32 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, state: { marginTop: 10 }, error: { color: '#B42318', textAlign: 'center', marginTop: 10 }, back: { paddingVertical: 12 }, imageFrame: { width: '100%', height: 230, marginTop: 2, borderRadius: 18, overflow: 'hidden' }, image: { width: '100%', height: '100%' }, imagePlaceholder: { alignItems: 'center', justifyContent: 'center' }, category: { marginTop: 22, fontSize: 13 }, name: { marginTop: 6, fontSize: 24, fontWeight: '800' }, body: { marginTop: 8, fontSize: 15, lineHeight: 22 }, price: { marginTop: 16, fontSize: 22, fontWeight: '800' }, label: { marginTop: 22, marginBottom: 3, fontSize: 15, fontWeight: '700' }, addButton: { marginTop: 24, minHeight: 50, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, addButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' }, disclaimer: { marginTop: 24, fontSize: 12, lineHeight: 18, color: '#687871' } });

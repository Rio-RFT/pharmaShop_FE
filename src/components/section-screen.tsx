import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useMedicineCategories } from '@/features/catalog/hooks/use-medicine-categories';
import { useMedicineSearch } from '@/features/catalog/hooks/use-medicine-search';
import { AppHeader } from '@/components/app-header';

type ScreenKind = 'categories' | 'cart' | 'orders' | 'account';
const copy: Record<ScreenKind, { title: string; subtitle: string; rows?: string[]; message: string }> = {
  categories: { title: 'Danh mục', subtitle: 'Tìm sản phẩm theo nhu cầu', rows: ['Thuốc không kê đơn', 'Vitamin & khoáng chất', 'Chăm sóc cá nhân', 'Thiết bị y tế', 'Mẹ và bé'], message: 'Danh mục sẽ được đồng bộ từ nhà thuốc.' },
  cart: { title: 'Giỏ hàng', subtitle: 'Giỏ hàng được lưu theo tài khoản', message: 'Đăng nhập để xem giỏ hàng của bạn.' },
  orders: { title: 'Đơn hàng', subtitle: 'Theo dõi các đơn mua gần đây', message: 'Đăng nhập để xem trạng thái đơn hàng.' },
  account: { title: 'Tài khoản', subtitle: 'Quản lý hồ sơ và địa chỉ nhận hàng', rows: ['Thông tin cá nhân', 'Địa chỉ giao hàng', 'Thông báo', 'Trợ giúp'], message: 'Đăng nhập để quản lý tài khoản PharmaShop.' },
};

export function SectionScreen({ kind }: { kind: ScreenKind }) {
  const theme = useTheme();
  const page = copy[kind];
  const categoryData = useMedicineCategories(kind === 'categories');
  const rows = kind === 'categories' ? categoryData.categories : page.rows;
  return <ThemedView style={styles.page}><SafeAreaView style={styles.safe} edges={['top']}><AppHeader /><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.heading}><ThemedText style={styles.title}>{page.title}</ThemedText><ThemedText themeColor="textSecondary" style={styles.subtitle}>{page.subtitle}</ThemedText></View>
    {kind === 'categories' && categoryData.loading ? <ThemedText themeColor="textSecondary" style={styles.state}>Đang tải danh mục…</ThemedText> : null}
    {kind === 'categories' && categoryData.error ? <View style={styles.notice}><ThemedText style={styles.noticeTitle}>{categoryData.error}</ThemedText><ThemedText onPress={categoryData.retry} style={{ color: theme.tint, marginTop: 8 }}>Thử tải lại</ThemedText></View> : null}
    {rows?.map((row, i) => kind === 'categories'
      ? <CategoryRow key={row} name={row} index={i} tint={theme.tint} background={theme.backgroundSelected} border={theme.backgroundElement} />
      : <View key={row} style={[styles.row, { borderBottomColor: theme.backgroundElement }]}><View style={[styles.marker, { backgroundColor: theme.backgroundSelected }]}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>{['Rx', 'V', '✳', '+', '•'][i % 5]}</ThemedText></View><ThemedText style={styles.rowText}>{row}</ThemedText></View>)}
    {kind !== 'categories' ? <View style={[styles.notice, { backgroundColor: theme.backgroundElement }]}><ThemedText style={styles.noticeTitle}>{page.message}</ThemedText><ThemedText themeColor="textSecondary" style={styles.noticeBody}>Khi kết nối API, nội dung tài khoản và đơn hàng sẽ hiển thị tại đây.</ThemedText></View> : null}
  </ScrollView></SafeAreaView></ThemedView>;
}

function CategoryRow({ name, index, tint, background, border }: { name: string; index: number; tint: string; background: string; border: string }) {
  const products = useMedicineSearch('', name, 12);
  const fallbackProducts = useMedicineSearch('', undefined, 12);
  const imageUrl = products.items.find((medicine) => medicine.imageUrl)?.imageUrl ?? fallbackProducts.items.find((medicine) => medicine.imageUrl)?.imageUrl;
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [imageUrl]);
  return <View style={[styles.row, { borderBottomColor: border }]}>
    <View style={[styles.marker, { backgroundColor: background }]}>
      {imageUrl && !imageFailed ? <Image source={{ uri: imageUrl }} style={styles.categoryImage} contentFit="cover" onError={() => setImageFailed(true)} /> : <ThemedText style={{ color: tint, fontWeight: '700' }}>{['Rx', 'V', '✳', '+', '•'][index % 5]}</ThemedText>}
    </View>
    <ThemedText style={styles.rowText}>{name}</ThemedText>
    <ThemedText themeColor="textSecondary" style={styles.chevron}>›</ThemedText>
  </View>;
}

const styles = StyleSheet.create({ page: { flex: 1 }, safe: { flex: 1 }, content: { paddingHorizontal: 20, paddingBottom: 32 }, heading: { paddingTop: 18, paddingBottom: 26 }, title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.7 }, subtitle: { marginTop: 5, fontSize: 14 }, row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, gap: 13 }, marker: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, categoryImage: { width: '100%', height: '100%' }, rowText: { flex: 1, fontSize: 15, fontWeight: '600' }, chevron: { fontSize: 25 }, state: { paddingVertical: 14 }, notice: { marginTop: 28, borderRadius: 16, padding: 18 }, noticeTitle: { fontSize: 15, fontWeight: '700' }, noticeBody: { fontSize: 13, lineHeight: 19, marginTop: 7 } });

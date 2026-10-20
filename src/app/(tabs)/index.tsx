import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useMedicineSearch } from '@/features/catalog/hooks/use-medicine-search';
import { useMedicineCategories } from '@/features/catalog/hooks/use-medicine-categories';
import { useRouter } from 'expo-router';
import { AppHeader } from '@/components/app-header';

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | undefined>();
  const catalog = useMedicineSearch(query, category);
  const categoryResult = useMedicineCategories();
  return (
    <ThemedView style={styles.page}>
      <SafeAreaView edges={['top']}>
        <AppHeader />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.search, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText themeColor="textSecondary" style={styles.searchIcon}>⌕</ThemedText>
            <TextInput value={query} onChangeText={setQuery} placeholder="Tìm thuốc, sản phẩm..." placeholderTextColor={theme.textSecondary} style={[styles.searchInput, { color: theme.text }]} accessibilityLabel="Tìm thuốc và sản phẩm" returnKeyType="search" />
          </View>

          <View style={styles.hero}>
            <View style={styles.heroCopy}><ThemedText style={styles.eyebrow}>NHÀ THUỐC TRỰC TUYẾN</ThemedText><ThemedText style={styles.heroTitle}>Sức khỏe của bạn,{ '\n' }ưu tiên của chúng tôi.</ThemedText><ThemedText style={styles.heroDescription}>Sản phẩm chính hãng, thông tin rõ ràng.</ThemedText></View>
            <View style={styles.heroMark}><ThemedText style={styles.plus}>+</ThemedText></View>
          </View>

          <View style={styles.sectionHeader}><ThemedText style={styles.sectionTitle}>Danh mục</ThemedText><ThemedText style={styles.seeAll}>Xem tất cả  ›</ThemedText></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
            {categoryResult.loading ? <ThemedText themeColor="textSecondary" style={styles.stateText}>Đang tải danh mục…</ThemedText> : categoryResult.error ? <Pressable onPress={categoryResult.retry}><ThemedText style={{ color: theme.tint }}>Tải lại danh mục</ThemedText></Pressable> : categoryResult.categories.map((item) => <CategoryTile key={item} name={item} selected={category === item} tint={theme.tint} background={category === item ? theme.backgroundSelected : theme.backgroundElement} fallbackImage={catalog.items.find((medicine) => medicine.category.toLocaleLowerCase() === item.toLocaleLowerCase() && medicine.imageUrl)?.imageUrl ?? catalog.items.find((medicine) => medicine.imageUrl)?.imageUrl} onPress={() => setCategory(category === item ? undefined : item)} />)}
          </ScrollView>

          <View style={styles.sectionHeader}><View><ThemedText style={styles.sectionTitle}>{query ? 'Kết quả tìm kiếm' : 'Được quan tâm'}</ThemedText><ThemedText themeColor="textSecondary" style={styles.caption}>Sản phẩm tham khảo</ThemedText></View><ThemedText style={styles.seeAll}>Xem tất cả  ›</ThemedText></View>
          {catalog.loading ? <ThemedText themeColor="textSecondary" style={styles.stateText}>Đang tải sản phẩm…</ThemedText> : catalog.error ? <View style={styles.errorState}><ThemedText style={{ color: '#B42318' }}>{catalog.error}</ThemedText><Pressable accessibilityRole="button" onPress={catalog.retry}><ThemedText style={{ color: theme.tint, fontWeight: '700', marginTop: 8 }}>Thử lại</ThemedText></Pressable></View> : catalog.items.length ? catalog.items.map((item) => <Pressable accessibilityRole="button" accessibilityLabel={`Xem ${item.name}`} key={item.id} onPress={() => router.push({ pathname: '/medicine/[id]', params: { id: item.id } })} style={[styles.product, { borderBottomColor: theme.backgroundElement }]}>{item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={{ width: 66, height: 66, borderRadius: 12 }} contentFit="cover" /> : <View style={[styles.productImage, { backgroundColor: '#E6F6F0' }]}><ThemedText style={styles.productMark}>Rx</ThemedText></View>}<View style={styles.productInfo}><ThemedText style={styles.productName}>{item.name}</ThemedText><ThemedText themeColor="textSecondary" style={styles.caption}>{item.activeIngredient || item.packaging}</ThemedText><ThemedText style={[styles.price, { color: theme.tint }]}>{money.format(Number(item.price))}</ThemedText></View><ThemedText themeColor="textSecondary" style={styles.chevron}>›</ThemedText></Pressable>) : <ThemedText themeColor="textSecondary" style={styles.empty}>Không có sản phẩm phù hợp.</ThemedText>}
          <ThemedText themeColor="textSecondary" style={styles.disclaimer}>Thông tin sản phẩm chỉ mang tính tham khảo. Vui lòng đọc kỹ hướng dẫn sử dụng.</ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function CategoryTile({ name, selected, tint, background, fallbackImage, onPress }: { name: string; selected: boolean; tint: string; background: string; fallbackImage?: string | null; onPress: () => void }) {
  const representative = useMedicineSearch('', name, 1);
  const imageUrl = representative.items.find((medicine) => medicine.imageUrl)?.imageUrl ?? fallbackImage;
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [imageUrl]);
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.category, { backgroundColor: background }]}>
      <View style={[styles.categoryIcon, { backgroundColor: '#FFFFFF' }]}>
        {imageUrl && !imageFailed ? <Image source={{ uri: imageUrl }} style={styles.categoryProductImage} contentFit="contain" onError={() => setImageFailed(true)} /> : <ThemedText style={{ color: tint, fontSize: 18, fontWeight: '700' }}>{name.slice(0, 1).toUpperCase()}</ThemedText>}
      </View>
      <ThemedText style={styles.categoryText}>{name}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { paddingHorizontal: 20, paddingBottom: 28 }, caption: { fontSize: 12, marginTop: 3 }, search: { height: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginTop: 8 }, searchIcon: { fontSize: 27, marginRight: 8 }, searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 }, hero: { minHeight: 164, borderRadius: 18, backgroundColor: '#EAF6F1', marginTop: 20, marginBottom: 28, padding: 20, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' }, heroCopy: { flex: 1 }, eyebrow: { color: '#238A65', fontSize: 10, letterSpacing: 1.1, fontWeight: '800', marginBottom: 9 }, heroTitle: { color: '#173D32', fontSize: 21, lineHeight: 27, fontWeight: '800', letterSpacing: -0.5 }, heroDescription: { color: '#55766B', fontSize: 12, marginTop: 8 }, heroMark: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#CDEBDD', alignItems: 'center', justifyContent: 'center', marginLeft: 8 }, plus: { color: '#25855F', fontSize: 63, fontWeight: '300', lineHeight: 72 }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }, sectionTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 }, seeAll: { color: '#168D68', fontSize: 12, fontWeight: '600' }, categoryList: { gap: 10, paddingBottom: 28 }, category: { width: 116, minHeight: 112, padding: 12, borderRadius: 14, justifyContent: 'space-between' }, categoryIcon: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, categoryProductImage: { width: '100%', height: '100%' }, categoryText: { fontSize: 12, lineHeight: 16, fontWeight: '600' }, product: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, gap: 13 }, productImage: { width: 66, height: 66, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, productMark: { fontSize: 19, fontWeight: '800', color: '#318B69' }, productInfo: { flex: 1, gap: 2 }, productName: { fontSize: 14, fontWeight: '600' }, price: { fontSize: 14, fontWeight: '700', marginTop: 4 }, chevron: { fontSize: 25 }, empty: { paddingVertical: 22 }, stateText: { paddingVertical: 14 }, errorState: { paddingVertical: 16 }, disclaimer: { marginTop: 20, fontSize: 11, lineHeight: 16 },
});

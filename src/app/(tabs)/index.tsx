import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/app-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MedicineListItem } from '@/features/catalog/components/medicine-list-item';
import { CategoryArtwork } from '@/features/catalog/components/category-artwork';
import { ProductSearchField } from '@/features/catalog/components/product-search-field';
import { useMedicineCategories } from '@/features/catalog/hooks/use-medicine-categories';
import { useMedicineSearch } from '@/features/catalog/hooks/use-medicine-search';
import { useTheme } from '@/hooks/use-theme';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [catalog, setCatalog] = useState('');
  const categories = useMedicineCategories();

  function submitSearch() {
    router.push({ pathname: '/search', params: catalog.trim() ? { keyword: catalog.trim() } : {} });
  }

  return (
    <ThemedView style={styles.page}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppHeader />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <ProductSearchField value={catalog} onChangeText={setCatalog} onSubmit={submitSearch} />

          <View style={[styles.hero, { backgroundColor: theme.backgroundSelected }]}>
            <View style={styles.heroCopy}>
              <ThemedText style={[styles.eyebrow, { color: theme.tint }]}>NHÀ THUỐC TRỰC TUYẾN</ThemedText>
              <ThemedText style={styles.heroTitle}>Sức khỏe của bạn,{ '\n' }ưu tiên của chúng tôi.</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.heroDescription}>Sản phẩm chính hãng, thông tin rõ ràng.</ThemedText>
            </View>
            <View style={[styles.heroMark, { backgroundColor: theme.backgroundSelected }]}>
              <SymbolView name={{ ios: 'cross.case', android: 'medical_services', web: 'medical_services' }} size={35} tintColor={theme.tint} />
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Danh mục</ThemedText>
            <Pressable accessibilityRole="button" onPress={() => router.navigate('/categories')} hitSlop={8}>
              <ThemedText style={[styles.seeAll, { color: theme.tint }]}>Xem tất cả ›</ThemedText>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
            {categories.loading ? <CategorySkeleton /> : null}
            {categories.error ? <Pressable accessibilityRole="button" onPress={categories.retry}><ThemedText style={{ color: theme.tint }}>Tải lại danh mục</ThemedText></Pressable> : null}
            {!categories.loading && !categories.error && categories.categories.map((name, index) => (
              <CategoryTile key={name} name={name} index={index} onPress={() => router.push({ pathname: '/category/[name]', params: { name } })} />
            ))}
            {!categories.loading && !categories.error && !categories.categories.length ? <ThemedText themeColor="textSecondary" style={styles.stateText}>Chưa có danh mục.</ThemedText> : null}
          </ScrollView>

          <View style={[styles.sectionHeader, styles.productsHeader]}>
            <View>
              <ThemedText style={styles.sectionTitle}>Sản phẩm</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.caption}>Khám phá sản phẩm tại nhà thuốc</ThemedText>
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push('/products')} hitSlop={8}>
              <ThemedText style={[styles.seeAll, { color: theme.tint }]}>Xem tất cả ›</ThemedText>
            </Pressable>
          </View>
          <HomeProducts />
          <ThemedText themeColor="textSecondary" style={styles.disclaimer}>Thông tin sản phẩm chỉ mang tính tham khảo. Vui lòng đọc kỹ hướng dẫn sử dụng.</ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function HomeProducts() {
  const theme = useTheme();
  const router = useRouter();
  const catalog = useMedicineSearch('', undefined, 4);

  if (catalog.loading) return <ProductSkeleton />;
  if (catalog.error) {
    return (
      <View style={styles.errorState}>
        <ThemedText themeColor="textSecondary">{catalog.error}</ThemedText>
        <Pressable accessibilityRole="button" onPress={catalog.retry} style={styles.retryLink}>
          <ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Thử lại</ThemedText>
        </Pressable>
      </View>
    );
  }
  if (!catalog.items.length) return <ThemedText themeColor="textSecondary" style={styles.stateText}>Chưa có sản phẩm để hiển thị.</ThemedText>;

  return (
    <View>
      {catalog.items.map((medicine) => (
        <MedicineListItem
          key={medicine.id}
          medicine={medicine}
          onPress={() => router.push({ pathname: '/medicine/[id]', params: { id: medicine.id } })}
        />
      ))}
    </View>
  );
}

function CategorySkeleton() {
  const theme = useTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Đang tải danh mục" style={styles.categorySkeletons}>
      {[0, 1, 2].map((item) => (
        <View key={item} style={[styles.categorySkeleton, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.categorySkeletonIcon, { backgroundColor: theme.backgroundSelected }]} />
          <View style={[styles.categorySkeletonLabel, { backgroundColor: theme.backgroundSelected }]} />
          <View style={[styles.categorySkeletonLabelShort, { backgroundColor: theme.backgroundSelected }]} />
        </View>
      ))}
    </View>
  );
}

function ProductSkeleton() {
  const theme = useTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Đang tải sản phẩm">
      {[0, 1, 2, 3].map((item) => (
        <View key={item} style={[styles.productSkeletonRow, { borderBottomColor: theme.backgroundElement }]}>
          <View style={[styles.productSkeletonImage, { backgroundColor: theme.backgroundElement }]} />
          <View style={styles.productSkeletonDetails}>
            <View style={[styles.productSkeletonTitle, { backgroundColor: theme.backgroundElement }]} />
            <View style={[styles.productSkeletonSubtitle, { backgroundColor: theme.backgroundElement }]} />
            <View style={[styles.productSkeletonPrice, { backgroundColor: theme.backgroundSelected }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

function CategoryTile({ name, index, onPress }: { name: string; index: number; onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Xem danh mục ${name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.category, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.72 : 1 }]}
    >
      <View style={[styles.categoryIcon, { backgroundColor: theme.background }]}>
        <CategoryArtwork category={name} index={index} imageStyle={styles.categoryImage} fallbackStyle={styles.categoryMark} />
      </View>
      <ThemedText style={styles.categoryText} numberOfLines={2}>{name}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  safe: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30, width: '100%', maxWidth: 840, alignSelf: 'center' },
  hero: { minHeight: 164, borderRadius: 18, marginTop: 20, marginBottom: 28, padding: 20, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  heroCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 10, letterSpacing: 1.1, fontWeight: '800', marginBottom: 9 },
  heroTitle: { fontSize: 21, lineHeight: 27, fontWeight: '800', letterSpacing: -0.5 },
  heroDescription: { fontSize: 12, lineHeight: 17, marginTop: 8 },
  heroMark: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  productsHeader: { marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  seeAll: { fontSize: 12, fontWeight: '600' },
  categoryList: { gap: 10, paddingBottom: 27 },
  categorySkeletons: { flexDirection: 'row', gap: 10, paddingBottom: 27 },
  categorySkeleton: { width: 116, minHeight: 112, padding: 12, borderRadius: 14, justifyContent: 'space-between' },
  categorySkeletonIcon: { width: 42, height: 42, borderRadius: 13 },
  categorySkeletonLabel: { width: '85%', height: 10, borderRadius: 5, marginTop: 12 },
  categorySkeletonLabelShort: { width: '58%', height: 10, borderRadius: 5, marginTop: 6 },
  productSkeletonRow: { minHeight: 100, flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  productSkeletonImage: { width: 76, height: 76, borderRadius: 13 },
  productSkeletonDetails: { flex: 1, gap: 9 },
  productSkeletonTitle: { width: '88%', height: 13, borderRadius: 7 },
  productSkeletonSubtitle: { width: '62%', height: 10, borderRadius: 5 },
  productSkeletonPrice: { width: 76, height: 13, borderRadius: 7, marginTop: 3 },
  category: { width: 116, minHeight: 112, padding: 12, borderRadius: 14, justifyContent: 'space-between' },
  categoryIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  categoryImage: { width: 42, height: 42 },
  categoryMark: { fontSize: 18 },
  categoryText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  caption: { fontSize: 12, marginTop: 3 },
  stateText: { paddingVertical: 16 },
  errorState: { paddingVertical: 15 },
  retryLink: { alignSelf: 'flex-start', paddingVertical: 8 },
  disclaimer: { marginTop: 20, fontSize: 11, lineHeight: 16 },
});

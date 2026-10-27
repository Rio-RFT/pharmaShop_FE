import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/app-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CategoryArtwork } from '@/features/catalog/components/category-artwork';
import { useMedicineCategories } from '@/features/catalog/hooks/use-medicine-categories';
import { LoadingIndicator } from '@/shared/components/loading-indicator';
import { useTheme } from '@/hooks/use-theme';
import { usePullToRefresh } from '@/shared/hooks/use-pull-to-refresh';
import { buildCategoryTree, type CategoryNode } from '@/features/catalog/lib/category-tree';
import { useMemo, useState } from 'react';

export default function CategoriesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const categories = useMedicineCategories();
  const pullRefresh = usePullToRefresh(categories.retry);
  const tree = useMemo(() => buildCategoryTree(categories.categoryItems), [categories.categoryItems]);
  const [path, setPath] = useState<CategoryNode[]>([]);
  const visibleCategories = path.length ? path[path.length - 1].children : tree;
  const navigate = (item: CategoryNode) => {
    if (item.children.length || item.name.trim().toLocaleUpperCase('vi') === 'THUỐC') setPath((current) => [...current, item]);
    else router.push({ pathname: '/category/[name]', params: { name: item.name } });
  };

  return (
    <ThemedView style={styles.page}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppHeader />
        <FlatList
          data={visibleCategories}
          refreshControl={<RefreshControl refreshing={pullRefresh.refreshing} onRefresh={() => void pullRefresh.onRefresh()} tintColor={theme.tint} colors={[theme.tint]} />}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.children.length ? `Mở danh mục con ${item.name}` : `Xem sản phẩm trong danh mục ${item.name}`}
              onPress={() => navigate(item)}
              style={({ pressed }) => [styles.row, { borderBottomColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.mark, { backgroundColor: theme.backgroundSelected }]}>
                <CategoryArtwork category={item.name} index={index} imageUrl={item.imageUrl} imageStyle={styles.categoryImage} fallbackStyle={styles.categoryMark} />
              </View>
              <ThemedText style={styles.name}>{item.name}</ThemedText>
              <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={16} tintColor={theme.textSecondary} />
            </Pressable>
          )}
          ListHeaderComponent={(
            <View style={styles.heading}>
              {path.length ? <View style={styles.breadcrumbs}><Pressable accessibilityRole="button" onPress={() => setPath((current) => current.slice(0, -1))}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>‹ Quay lại</ThemedText></Pressable><ThemedText themeColor="textSecondary">{path.map((item) => item.name).join(' / ')}</ThemedText></View> : null}
              <ThemedText style={styles.title}>Danh mục</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.subtitle}>Tìm sản phẩm theo nhu cầu</ThemedText>
            </View>
          )}
          ListEmptyComponent={categories.loading ? (
            <View style={styles.state}><LoadingIndicator size={42} color={theme.tint} /><ThemedText themeColor="textSecondary" style={styles.stateText}>Đang tải danh mục…</ThemedText></View>
          ) : categories.error ? (
            <View style={styles.state}>
              <ThemedText style={styles.stateTitle}>Chưa tải được danh mục</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.stateText}>{categories.error}</ThemedText>
              <Pressable accessibilityRole="button" onPress={categories.retry} style={[styles.retryButton, { backgroundColor: theme.tint }]}>
                <ThemedText style={styles.retryText}>Thử lại</ThemedText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.state}>
              <ThemedText style={styles.stateTitle}>{path.length ? 'Chưa có danh mục con' : 'Chưa có danh mục'}</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.stateText}>Danh mục sản phẩm sẽ xuất hiện tại đây.</ThemedText>
            </View>
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  safe: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 30, width: '100%', maxWidth: 840, alignSelf: 'center' },
  heading: { paddingTop: 22, paddingBottom: 22 },
  breadcrumbs: { gap: 12, marginBottom: 14 },
  title: { fontSize: 27, lineHeight: 34, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { fontSize: 14, marginTop: 3 },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  mark: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  categoryImage: { width: 42, height: 42 },
  categoryMark: { fontSize: 16 },
  name: { flex: 1, fontSize: 15, fontWeight: '600' },
  state: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24 },
  stateTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  stateText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  retryButton: { minHeight: 44, minWidth: 120, paddingHorizontal: 18, marginTop: 5, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});

import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/app-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LoadingIndicator } from '@/shared/components/loading-indicator';
import { searchMedicines, type Medicine } from '@/features/catalog/api/medicines';
import { MedicineListItem } from '@/features/catalog/components/medicine-list-item';
import { ProductSearchField } from '@/features/catalog/components/product-search-field';
import { useTheme } from '@/hooks/use-theme';

type CatalogMode = 'all' | 'search' | 'category';

type MedicineCatalogScreenProps = {
  mode: CatalogMode;
  category?: string;
  keyword?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onSearchSubmit?: () => void;
};

const PAGE_SIZE = 15;

export function MedicineCatalogScreen({
  mode,
  category,
  keyword,
  searchValue = '',
  onSearchChange,
  onSearchSubmit,
}: MedicineCatalogScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const normalizedKeyword = keyword?.trim() ?? '';
  const query = useInfiniteQuery({
    queryKey: ['medicines', 'search', { keyword: normalizedKeyword || undefined, category }],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => searchMedicines({
      keyword: normalizedKeyword || undefined,
      category,
      page: pageParam,
      limit: PAGE_SIZE,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    }),
    getNextPageParam: (lastPage) => lastPage.pagination.page < lastPage.pagination.totalPages
      ? lastPage.pagination.page + 1
      : undefined,
    enabled: (mode !== 'search' || normalizedKeyword.length > 0) && (mode !== 'category' || Boolean(category?.trim())),
  });

  const medicines = query.data?.pages.flatMap((page) => page.data) ?? [];
  const total = query.data?.pages[0]?.pagination.total;
  const title = mode === 'all' ? 'Tất cả sản phẩm' : mode === 'category' ? category ?? 'Danh mục' : 'Tìm kiếm';
  const subtitle = mode === 'all'
    ? 'Khám phá các sản phẩm tại nhà thuốc'
    : mode === 'category'
      ? 'Sản phẩm thuộc danh mục này'
      : normalizedKeyword
        ? `Kết quả cho “${normalizedKeyword}”`
        : 'Tìm theo tên thuốc hoặc hoạt chất';

  return (
    <ThemedView style={styles.page}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppHeader />
        <FlatList
          data={medicines}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MedicineListItem
              medicine={item}
              onPress={() => router.push({ pathname: '/medicine/[id]', params: { id: item.id } })}
            />
          )}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          onEndReachedThreshold={0.45}
          refreshControl={(
            <RefreshControl
              refreshing={query.isRefetching && !query.isFetchingNextPage}
              onRefresh={() => void query.refetch()}
              tintColor={theme.tint}
              colors={[theme.tint]}
            />
          )}
          ListHeaderComponent={(
            <View style={styles.listHeader}>
              <ThemedText style={styles.title}>{title}</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.subtitle}>{subtitle}</ThemedText>
              {mode === 'search' && onSearchChange && onSearchSubmit ? (
                <View style={styles.searchField}>
                  <ProductSearchField value={searchValue} onChangeText={onSearchChange} onSubmit={onSearchSubmit} />
                </View>
              ) : null}
              {total !== undefined ? (
                <ThemedText themeColor="textSecondary" style={styles.count}>{total} sản phẩm</ThemedText>
              ) : null}
            </View>
          )}
          ListEmptyComponent={(
            <CatalogEmptyState
              mode={mode}
              keyword={normalizedKeyword}
              loading={query.isPending || query.isLoading}
              error={query.error ? 'Không tải được sản phẩm. Kiểm tra kết nối rồi thử lại.' : null}
              tint={theme.tint}
              onRetry={() => void query.refetch()}
            />
          )}
          ListFooterComponent={query.isFetchingNextPage ? (
            <View style={styles.footerLoading}><LoadingIndicator size={28} color={theme.tint} /></View>
          ) : query.isFetchNextPageError ? (
            <Pressable accessibilityRole="button" onPress={() => void query.fetchNextPage()} style={styles.footerAction}>
              <ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Không tải thêm được. Thử lại</ThemedText>
            </Pressable>
          ) : undefined}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function CatalogEmptyState({
  mode,
  keyword,
  loading,
  error,
  tint,
  onRetry,
}: {
  mode: CatalogMode;
  keyword: string;
  loading: boolean;
  error: string | null;
  tint: string;
  onRetry: () => void;
}) {
  if (loading) {
    return <View style={styles.emptyState}><LoadingIndicator size={42} color={tint} /><ThemedText themeColor="textSecondary" style={styles.emptyCaption}>Đang tải sản phẩm…</ThemedText></View>;
  }

  if (error) {
    return (
      <View style={styles.emptyState}>
        <ThemedText style={styles.emptyTitle}>Chưa thể tải danh sách</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.emptyCaption}>{error}</ThemedText>
        <Pressable accessibilityRole="button" onPress={onRetry} style={[styles.retryButton, { backgroundColor: tint }]}>
          <ThemedText style={styles.retryText}>Thử lại</ThemedText>
        </Pressable>
      </View>
    );
  }

  if (mode === 'search' && !keyword) {
    return <View style={styles.emptyState}><ThemedText style={styles.emptyTitle}>Nhập từ khóa để bắt đầu</ThemedText><ThemedText themeColor="textSecondary" style={styles.emptyCaption}>Tìm theo tên thuốc, hoạt chất hoặc công dụng.</ThemedText></View>;
  }

  return <View style={styles.emptyState}><ThemedText style={styles.emptyTitle}>Không tìm thấy sản phẩm</ThemedText><ThemedText themeColor="textSecondary" style={styles.emptyCaption}>Thử từ khóa khác hoặc xem lại danh mục.</ThemedText></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  safe: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 28, width: '100%', maxWidth: 840, alignSelf: 'center' },
  listHeader: { paddingTop: 22, paddingBottom: 8 },
  title: { fontSize: 27, lineHeight: 34, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 3 },
  searchField: { marginTop: 18 },
  count: { fontSize: 12, marginTop: 21, marginBottom: 2 },
  emptyState: { flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  emptyCaption: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  retryButton: { minHeight: 44, minWidth: 120, paddingHorizontal: 18, marginTop: 5, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  footerLoading: { minHeight: 66, alignItems: 'center', justifyContent: 'center' },
  footerAction: { minHeight: 52, alignItems: 'center', justifyContent: 'center' },
});

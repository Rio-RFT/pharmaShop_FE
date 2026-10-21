import { AppHeader } from '@/components/app-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/features/auth/auth-provider';
import { getNotifications, type NotificationSummary } from '@/features/notifications/api/notifications';
import { useTheme } from '@/hooks/use-theme';
import { LoadingIndicator } from '@/shared/components/loading-indicator';
import { ApiError } from '@/shared/api/client';
import { Image } from 'expo-image';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type InboxTab = 'SYSTEM' | 'EVENT';

export default function NotificationsInboxScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<InboxTab>('SYSTEM');
  const inbox = useInfiniteQuery({
    queryKey: ['notifications', 'inbox'],
    queryFn: ({ pageParam }) => getNotifications(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => last.hasMore ? last.page + 1 : undefined,
    enabled: !!user,
  });
  const allItems = inbox.data?.pages.flatMap((page) => page.items) ?? [];
  const unreadCount = inbox.data?.pages[0]?.unreadCount ?? 0;
  const items = allItems.filter((item) => getTab(item) === activeTab);

  useEffect(() => { if (!loading && !user) router.replace('/auth/login'); }, [loading, user, router]);

  const openItem = (item: NotificationSummary) => router.push(`/notifications/${item.notification.id}` as import('expo-router').Href);
  const loadMore = () => { if (inbox.hasNextPage && !inbox.isFetchingNextPage) void inbox.fetchNextPage(); };

  return <ThemedView style={styles.page}><SafeAreaView style={styles.safe} edges={['top']}><AppHeader />
    <View style={styles.heading}>
      <View><ThemedText style={styles.title}>Thông báo</ThemedText><ThemedText themeColor="textSecondary" style={styles.subtitle}>{unreadCount} thông báo chưa đọc</ThemedText></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Làm mới thông báo" onPress={() => void inbox.refetch()} hitSlop={8} style={styles.refresh}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Làm mới</ThemedText></Pressable>
    </View>
    <View accessibilityRole="tablist" style={[styles.tabs, { borderBottomColor: theme.backgroundElement }]}>
      {(['SYSTEM', 'EVENT'] as const).map((tab) => {
        const selected = activeTab === tab;
        return <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setActiveTab(tab)} style={[styles.tab, selected && { borderBottomColor: theme.tint }]}>
          <ThemedText style={[styles.tabLabel, { color: selected ? theme.tint : theme.textSecondary }]}>{tab === 'SYSTEM' ? 'Thông báo hệ thống' : 'Sự kiện'}</ThemedText>
        </Pressable>;
      })}
    </View>
    {loading || inbox.isLoading ? <View style={styles.center}><LoadingIndicator size={52} color={theme.tint} /></View> : inbox.error ? <View style={styles.center}><ThemedText accessibilityRole="alert" style={styles.error}>{inbox.error instanceof ApiError ? inbox.error.message : 'Không tải được thông báo.'}</ThemedText><Pressable onPress={() => void inbox.refetch()}><ThemedText style={{ color: theme.tint }}>Thử lại</ThemedText></Pressable></View> : <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={inbox.isRefetching} onRefresh={() => { void inbox.refetch(); }} tintColor={theme.tint} />}
      contentContainerStyle={items.length ? styles.list : styles.empty}
      ListEmptyComponent={<View style={styles.center}><ThemedText style={styles.emptyTitle}>{activeTab === 'SYSTEM' ? 'Chưa có thông báo hệ thống' : 'Chưa có sự kiện'}</ThemedText><ThemedText themeColor="textSecondary" style={styles.emptyDescription}>Thông báo mới sẽ xuất hiện tại đây.</ThemedText>{inbox.hasNextPage ? <Pressable onPress={loadMore} style={styles.loadMore}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Tải thêm</ThemedText></Pressable> : null}</View>}
      renderItem={({ item }) => <NotificationRow item={item} event={activeTab === 'EVENT'} onPress={() => openItem(item)} />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.35}
      ListFooterComponent={inbox.isFetchingNextPage ? <LoadingIndicator size={36} color={theme.tint} /> : undefined}
    />}
  </SafeAreaView></ThemedView>;
}

function getTab(item: NotificationSummary): InboxTab {
  // New backend responses should provide category. Until then, PAGE is the existing event-page format.
  return item.notification.category ?? (item.notification.type === 'PAGE' ? 'EVENT' : 'SYSTEM');
}

function NotificationRow({ item, event, onPress }: { item: NotificationSummary; event: boolean; onPress: () => void }) {
  const theme = useTheme();
  const imageUrl = item.notification.imageUrl;
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, event && styles.eventRow, { borderBottomColor: theme.backgroundElement, opacity: pressed ? 0.78 : 1 }]}>
    {event ? <View style={[styles.eventImage, { backgroundColor: theme.backgroundElement }]}>
      {imageUrl ? <Image source={{ uri: imageUrl }} contentFit="cover" style={StyleSheet.absoluteFill} accessibilityLabel="Ảnh sự kiện" /> : <ThemedText style={[styles.eventMark, { color: theme.tint }]}>✦</ThemedText>}
    </View> : <View style={[styles.unreadDot, { backgroundColor: item.readAt ? 'transparent' : theme.tint, borderColor: item.readAt ? theme.backgroundSelected : theme.tint }]} />}
    <View style={styles.itemBody}>
      <ThemedText style={styles.itemTitle}>{item.notification.title}</ThemedText>
      <ThemedText themeColor="textSecondary" numberOfLines={event ? 3 : 2} style={styles.body}>{item.notification.body}</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.date}>{new Date(item.createdAt).toLocaleDateString('vi-VN')}</ThemedText>
    </View>
    {!item.readAt ? <View accessibilityLabel="Chưa đọc" style={[styles.newDot, { backgroundColor: theme.tint }]} /> : null}
  </Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, safe: { flex: 1 },
  heading: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 26, fontWeight: '800' }, subtitle: { fontSize: 13, marginTop: 4 }, refresh: { padding: 8 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, marginHorizontal: 20 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabLabel: { fontSize: 13, fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 28 }, empty: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 17, borderBottomWidth: StyleSheet.hairlineWidth },
  eventRow: { marginTop: 12, padding: 10, borderRadius: 12, borderBottomWidth: 0, backgroundColor: 'rgba(120, 150, 135, 0.08)' },
  eventImage: { width: 100, height: 100, borderRadius: 9, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, eventMark: { fontSize: 30, fontWeight: '700' },
  unreadDot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1, marginTop: 5 }, itemBody: { flex: 1 }, itemTitle: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 19, marginTop: 5 }, date: { fontSize: 11, marginTop: 8 }, newDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  center: { alignItems: 'center', justifyContent: 'center', flex: 1, gap: 10, padding: 22 }, emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' }, emptyDescription: { textAlign: 'center' },
  error: { color: '#B42318', textAlign: 'center' }, loadMore: { alignItems: 'center', paddingVertical: 14 },
});

import { AppHeader } from '@/components/app-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getNotificationDetail, type NotificationBlock } from '@/features/notifications/api/notifications';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/shared/api/client';
import { LoadingIndicator } from '@/shared/components/loading-indicator';
import { Image } from 'expo-image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePullToRefresh } from '@/shared/hooks/use-pull-to-refresh';

export default function NotificationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const router = useRouter(); const theme = useTheme(); const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['notifications', 'detail', id], queryFn: () => getNotificationDetail(id), enabled: !!id });
  const pullRefresh = usePullToRefresh();
  useEffect(() => { if (detail.data) void queryClient.invalidateQueries({ queryKey: ['notifications'] }); }, [detail.data?.readAt, queryClient]);
  const openAction = async (url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && parsed.hostname && !parsed.username && !parsed.password) { await Linking.openURL(url); return; }
      if (parsed.protocol !== 'pharmashop:') throw new Error('invalid URL');
      const segments = [parsed.hostname, ...parsed.pathname.split('/').filter(Boolean)];
      if (segments[0] === 'catalog' || segments[0] === 'products') router.push('/products');
      else if (segments[0] === 'category' && segments[1]) router.push({ pathname: '/category/[name]', params: { name: decodeURIComponent(segments[1]) } });
      else if (segments[0] === 'medicine' && segments[1]) router.push({ pathname: '/medicine/[id]', params: { id: segments[1] } });
      else if (segments[0] === 'notifications' && segments[1]) router.push(`/notifications/${segments[1]}` as import('expo-router').Href);
      else if (segments[0] === 'orders') router.push('/orders');
      else if (segments[0] === 'account') router.push('/account');
      else throw new Error('unsupported app link');
    } catch { Alert.alert('Liên kết không hợp lệ', 'Liên kết này không được hỗ trợ trong ứng dụng.'); }
  };
  const renderBlock = (block: NotificationBlock, index: number) => {
    if (block.type === 'HEADING') return <ThemedText key={index} style={styles.blockHeading}>{block.text}</ThemedText>;
    if (block.type === 'TEXT') return <ThemedText key={index} style={styles.blockText}>{block.text}</ThemedText>;
    if (block.type === 'DIVIDER') return <View key={index} style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />;
    if (block.type === 'IMAGE') return <Image key={index} source={{ uri: block.url }} contentFit="contain" accessibilityLabel={block.altText ?? 'Ảnh trong thông báo'} style={styles.image} />;
    if (block.type === 'BUTTON') return <Pressable key={index} accessibilityRole="button" onPress={() => void openAction(block.url)} style={[styles.actionButton, { backgroundColor: theme.tint }]}><ThemedText style={styles.actionText}>{block.label}</ThemedText></Pressable>;
    return null;
  };

  return <ThemedView style={styles.page}><SafeAreaView style={styles.safe} edges={['top']}><AppHeader />
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>‹ Thông báo</ThemedText></Pressable>
    {detail.isLoading ? <View style={styles.center}><LoadingIndicator size={52} color={theme.tint} /></View> : detail.error ? <View style={styles.center}><ThemedText accessibilityRole="alert" style={styles.error}>{detail.error instanceof ApiError ? detail.error.message : 'Không tải được thông báo.'}</ThemedText><Pressable onPress={() => void detail.refetch()}><ThemedText style={{ color: theme.tint }}>Thử lại</ThemedText></Pressable></View> : detail.data ? <ScrollView alwaysBounceVertical refreshControl={<RefreshControl refreshing={pullRefresh.refreshing} onRefresh={() => void pullRefresh.onRefresh()} tintColor={theme.tint} colors={[theme.tint]} />} contentContainerStyle={styles.content}>
      <ThemedText style={styles.title}>{detail.data.title}</ThemedText><ThemedText themeColor="textSecondary" style={styles.date}>{new Date(detail.data.createdAt).toLocaleString('vi-VN')} · {detail.data.type === 'PAGE' ? 'Trang sự kiện' : 'Thông báo'}</ThemedText><ThemedText style={styles.body}>{detail.data.body}</ThemedText>
      {detail.data.type === 'PAGE' ? <View style={styles.blocks}>{(detail.data.content ?? []).map(renderBlock)}</View> : null}
    </ScrollView> : null}
  </SafeAreaView></ThemedView>;
}

const styles = StyleSheet.create({ page: { flex: 1 }, safe: { flex: 1 }, back: { alignSelf: 'flex-start', paddingHorizontal: 20, paddingVertical: 12 }, content: { paddingHorizontal: 20, paddingBottom: 40 }, title: { fontSize: 25, lineHeight: 32, fontWeight: '800' }, date: { fontSize: 12, marginTop: 8 }, body: { fontSize: 15, lineHeight: 23, marginTop: 18 }, blocks: { marginTop: 12, gap: 14 }, blockHeading: { fontSize: 20, lineHeight: 27, fontWeight: '800', marginTop: 6 }, blockText: { fontSize: 15, lineHeight: 23 }, image: { width: '100%', height: 220, borderRadius: 12 }, divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 }, actionButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingHorizontal: 16 }, actionText: { color: '#fff', fontWeight: '700' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 }, error: { color: '#B42318', textAlign: 'center' } });

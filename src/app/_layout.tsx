import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Image } from 'expo-image';
import Constants from 'expo-constants';
import { ActivityIndicator, AppState, Modal, Platform, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Updates from 'expo-updates';
import * as Notifications from 'expo-notifications';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/features/auth/auth-provider';
import { CartFlightProvider } from '@/components/cart-flight-provider';
import { useAuth } from '@/features/auth/auth-provider';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LoadingIndicator } from '@/shared/components/loading-indicator';
import { useTheme } from '@/hooks/use-theme';
import { getAppDisplayVersion } from '@/shared/lib/app-version';
import { UpdateCheckContext } from '@/shared/hooks/use-update-check';
import { SupportChatOverlay } from '@/features/support-chat/components/support-chat-overlay';
import { registerPushDevice } from '@/features/notifications/lib/push-registration';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CartFlightProvider>
            <AppBootstrap />
          </CartFlightProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function AppBootstrap() {
  const { loading: authLoading, user } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const { downloadProgress } = Updates.useUpdates();
  const checkingUpdate = useRef(false);
  const queuedManualCheck = useRef(false);
  const updatePromptVisible = useRef(false);
  const applyingUpdate = useRef(false);
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<{ version: string; revision: string } | null>(null);
  const [updateStage, setUpdateStage] = useState<'checking' | 'up-to-date' | 'available' | 'downloading' | 'restarting' | 'error'>('available');
  const [updateError, setUpdateError] = useState<string | null>(null);
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  const handledNotificationResponse = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void registerPushDevice().catch(() => undefined);
  }, [user?.id]);

  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!lastNotificationResponse) { handledNotificationResponse.current = null; return; }
    if (authLoading) return;
    const notification = lastNotificationResponse.notification;
    const responseKey = `${notification.request.identifier}:${notification.date}`;
    if (handledNotificationResponse.current === responseKey) return;
    const data = notification.request.content.data;
    if (!data) return;
    const notificationId = typeof data['notificationId'] === 'string' ? data['notificationId'] : null;
    const screen = data['screen'];
    if (!notificationId || !isUuid(notificationId) || screen !== 'notification-detail') return;
    handledNotificationResponse.current = responseKey;
    if (user) router.push(`/notifications/${notificationId}` as import('expo-router').Href);
    else router.push({ pathname: '/auth/login', params: { notificationId } });
    void Notifications.clearLastNotificationResponseAsync();
  }, [authLoading, lastNotificationResponse, router, user]);

  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  const checkForUpdate = useCallback(async (showChecking: boolean) => {
    if (checkingUpdate.current) {
      if (showChecking) {
        queuedManualCheck.current = true;
        updatePromptVisible.current = true;
        setUpdateModalVisible(true);
        setUpdateStage('checking');
        setAvailableUpdate(null);
      }
      return;
    }
    if (applyingUpdate.current) return;
    if (!Updates.isEnabled || Platform.OS !== 'android') {
      if (showChecking) {
        updatePromptVisible.current = true;
        setUpdateModalVisible(true);
        setUpdateStage('error');
        setUpdateError('Kiểm tra OTA hiện chỉ khả dụng trên bản Android đã cấu hình EAS Update.');
      }
      return;
    }

    checkingUpdate.current = true;
    if (showChecking) {
      updatePromptVisible.current = true;
      setUpdateModalVisible(true);
      setAvailableUpdate(null);
      setUpdateStage('checking');
      setUpdateError(null);
    }

    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        if (showChecking) setUpdateStage('up-to-date');
        return;
      }

      updatePromptVisible.current = true;
      const currentVersion = Constants.expoConfig?.version ?? 'Không xác định';
      const newVersion = getManifestAppVersion(result.manifest) ?? currentVersion;
      setAvailableUpdate({ version: newVersion, revision: result.manifest.id.slice(0, 8) });
      setUpdateStage('available');
      setUpdateError(null);
      setUpdateModalVisible(true);
    } catch {
      if (showChecking) {
        updatePromptVisible.current = true;
        setUpdateStage('error');
        setUpdateError('Không thể kiểm tra cập nhật. Hãy kiểm tra kết nối mạng rồi thử lại.');
      }
    } finally {
      checkingUpdate.current = false;
      if (queuedManualCheck.current) {
        queuedManualCheck.current = false;
        void checkForUpdate(true);
      }
    }
  }, []);

  useEffect(() => {
    if (__DEV__ || Platform.OS !== 'android' || !Updates.isEnabled) return;
    void checkForUpdate(false);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !updatePromptVisible.current) void checkForUpdate(false);
    });
    return () => subscription.remove();
  }, [checkForUpdate]);

  const dismissUpdate = () => {
    if (applyingUpdate.current) return;
    updatePromptVisible.current = false;
    setUpdateModalVisible(false);
    setAvailableUpdate(null);
    setUpdateError(null);
  };

  const requestUpdateCheck = useCallback(() => { void checkForUpdate(true); }, [checkForUpdate]);

  const applyUpdate = async () => {
    if (applyingUpdate.current) return;
    applyingUpdate.current = true;
    setUpdateStage('downloading');
    setUpdateError(null);
    try {
      const result = await Updates.fetchUpdateAsync();
      if (!result.isNew) throw new Error('Bản cập nhật không còn khả dụng. Hãy kiểm tra lại kết nối rồi thử lại.');
      setUpdateStage('restarting');
      await Updates.reloadAsync();
    } catch {
      applyingUpdate.current = false;
      setUpdateStage('error');
      setUpdateError('Không thể tải hoặc cài đặt bản cập nhật. Hãy kiểm tra kết nối mạng rồi thử lại.');
    }
  };

  if (authLoading) {
    return (
      <ThemedView style={styles.startupPage}>
        <Image
          source={require('../../public/logo.png')}
          style={styles.startupLogo}
          contentFit="contain"
          accessibilityLabel="Logo PharmaShop"
        />
        <ThemedText style={styles.startupTitle}>PharmaShop</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.startupSubtitle}>Chăm sóc sức khỏe mỗi ngày</ThemedText>
        <View style={styles.startupLoader}>
          <LoadingIndicator size={60} color={theme.tint} />
        </View>
        <ThemedText themeColor="textSecondary" style={styles.startupStatus} accessibilityLiveRegion="polite">
          Đang chuẩn bị ứng dụng…
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <UpdateCheckContext.Provider value={requestUpdateCheck}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="admin/notifications" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="notifications/[id]" />
        <Stack.Screen name="products" />
        <Stack.Screen name="search" />
        <Stack.Screen name="category/[name]" />
        <Stack.Screen name="medicine/[id]" />
        <Stack.Screen name="checkout" />
        <Stack.Screen name="order/[id]" />
        <Stack.Screen name="payment/return" />
        <Stack.Screen name="payment/cancel" />
        <Stack.Screen name="auth/login" options={{ presentation: 'modal' }} />
        <Stack.Screen name="auth/register" options={{ presentation: 'modal' }} />
      </Stack>
      <Modal
        transparent
        animationType="fade"
        visible={updateModalVisible}
        statusBarTranslucent
        onRequestClose={dismissUpdate}
      >
        <View style={updateStyles.backdrop}>
          <View style={[updateStyles.dialog, { backgroundColor: theme.background }]}>
            <View style={[updateStyles.icon, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText style={[updateStyles.iconText, { color: theme.tint }]}>↻</ThemedText>
            </View>
            <ThemedText style={updateStyles.title}>
              {updateStage === 'checking' ? 'Đang kiểm tra cập nhật' : updateStage === 'up-to-date' ? 'Đã là phiên bản mới nhất' : updateStage === 'error' ? 'Kiểm tra cập nhật chưa hoàn tất' : updateStage === 'restarting' ? 'Đang cài đặt cập nhật' : updateStage === 'downloading' ? 'Đang tải cập nhật' : 'Có phiên bản mới'}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={updateStyles.description}>
              {updateStage === 'error'
                ? updateError
                : updateStage === 'checking'
                  ? 'Đang kết nối máy chủ để kiểm tra phiên bản mới…'
                  : updateStage === 'up-to-date'
                    ? 'Ứng dụng của bạn đang sử dụng phiên bản mới nhất.'
                : updateStage === 'restarting'
                  ? 'Đang khởi động lại PharmaShop với phiên bản mới…'
                  : updateStage === 'downloading'
                    ? 'Vui lòng giữ ứng dụng đang mở trong khi tải bản cập nhật.'
                    : 'Cập nhật PharmaShop để tiếp tục sử dụng phiên bản mới nhất.'}
            </ThemedText>
            <View style={[updateStyles.versionPanel, { backgroundColor: theme.backgroundElement }]}>
              <VersionRow label="Phiên bản hiện tại" value={getAppDisplayVersion()} />
              {availableUpdate ? <>
                <View style={[updateStyles.divider, { backgroundColor: theme.backgroundSelected }]} />
                <VersionRow label="Phiên bản mới" value={availableUpdate.version} />
              </> : null}
              {availableUpdate ? <ThemedText themeColor="textSecondary" style={updateStyles.revision}>Bản OTA · {availableUpdate.revision}</ThemedText> : null}
            </View>
            {updateStage === 'downloading' || updateStage === 'restarting' || updateStage === 'checking' ? (
              <View style={updateStyles.progressArea}>
                {updateStage === 'downloading' && typeof downloadProgress === 'number' ? (
                  <>
                    <View style={[updateStyles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
                      <View style={[updateStyles.progressFill, { backgroundColor: theme.tint, width: `${Math.round(downloadProgress * 100)}%` }]} />
                    </View>
                    <ThemedText themeColor="textSecondary" style={updateStyles.progressLabel}>{Math.round(downloadProgress * 100)}% đã tải</ThemedText>
                  </>
                ) : (
                  <View style={updateStyles.progressSpinner}>
                    <ActivityIndicator color={theme.tint} />
                    <ThemedText themeColor="textSecondary" style={updateStyles.progressLabel}>{updateStage === 'restarting' ? 'Đang áp dụng bản tải về…' : updateStage === 'checking' ? 'Đang kiểm tra…' : 'Đang kết nối máy chủ cập nhật…'}</ThemedText>
                  </View>
                )}
              </View>
            ) : updateStage === 'available' ? (
              <View style={updateStyles.actions}>
                <Pressable accessibilityRole="button" onPress={dismissUpdate} style={[updateStyles.secondary, { borderColor: theme.backgroundSelected }]}>
                  <ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Để sau</ThemedText>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => void applyUpdate()} style={[updateStyles.primary, { backgroundColor: theme.tint }]}>
                  <ThemedText style={updateStyles.primaryText}>Cập nhật</ThemedText>
                </Pressable>
              </View>
            ) : (
              <View style={updateStyles.actions}>
                <Pressable accessibilityRole="button" onPress={dismissUpdate} style={[updateStyles.secondary, { borderColor: theme.backgroundSelected }]}>
                  <ThemedText style={{ color: theme.tint, fontWeight: '700' }}>{updateStage === 'error' ? 'Đóng' : 'Hoàn tất'}</ThemedText>
                </Pressable>
                {updateStage === 'error' ? <Pressable accessibilityRole="button" onPress={() => availableUpdate ? void applyUpdate() : void checkForUpdate(true)} style={[updateStyles.primary, { backgroundColor: theme.tint }]}>
                  <ThemedText style={updateStyles.primaryText}>Thử lại</ThemedText>
                </Pressable> : null}
              </View>
            )}
          </View>
        </View>
      </Modal>
      <SupportChatOverlay />
    </UpdateCheckContext.Provider>
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function VersionRow({ label, value }: { label: string; value: string }) {
  return <View style={updateStyles.versionRow}>
    <ThemedText themeColor="textSecondary" style={updateStyles.versionLabel}>{label}</ThemedText>
    <ThemedText style={updateStyles.versionValue}>{value}</ThemedText>
  </View>;
}

function getManifestAppVersion(manifest: unknown): string | undefined {
  if (typeof manifest !== 'object' || manifest === null || !('extra' in manifest)) return undefined;
  const extra = manifest.extra;
  if (typeof extra !== 'object' || extra === null || !('expoClient' in extra)) return undefined;
  const expoClient = extra.expoClient;
  if (typeof expoClient !== 'object' || expoClient === null || !('version' in expoClient)) return undefined;
  return typeof expoClient.version === 'string' ? expoClient.version : undefined;
}

const styles = {
  startupPage: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 28 },
  startupLogo: { width: 132, height: 142 },
  startupTitle: { fontSize: 24, lineHeight: 31, fontWeight: '800' as const, marginTop: 18 },
  startupSubtitle: { fontSize: 14, marginTop: 4 },
  startupLoader: { marginTop: 48 },
  startupStatus: { fontSize: 12, marginTop: 16 },
};

const updateStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(9, 20, 17, 0.56)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  dialog: { width: '100%', maxWidth: 420, borderRadius: 24, padding: 24, alignItems: 'center' },
  icon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  iconText: { fontSize: 31, lineHeight: 36, fontWeight: '700' },
  title: { fontSize: 21, lineHeight: 27, fontWeight: '800', textAlign: 'center' },
  description: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 },
  versionPanel: { width: '100%', borderRadius: 15, padding: 14, marginTop: 20 },
  versionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 25 },
  versionLabel: { fontSize: 12 },
  versionValue: { fontSize: 13, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 7 },
  revision: { fontSize: 11, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 22 },
  secondary: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  primary: { flex: 1, minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  progressArea: { width: '100%', minHeight: 58, marginTop: 22, justifyContent: 'center' },
  progressTrack: { height: 8, borderRadius: 99, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 99 },
  progressLabel: { fontSize: 12, textAlign: 'center', marginTop: 9 },
  progressSpinner: { alignItems: 'center', gap: 9 },
});

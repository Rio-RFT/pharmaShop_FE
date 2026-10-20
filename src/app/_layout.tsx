import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Image } from 'expo-image';
import { Alert, AppState, Platform, useColorScheme, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import * as Updates from 'expo-updates';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/features/auth/auth-provider';
import { CartFlightProvider } from '@/components/cart-flight-provider';
import { useAuth } from '@/features/auth/auth-provider';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LoadingIndicator } from '@/shared/components/loading-indicator';
import { useTheme } from '@/hooks/use-theme';

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
  const { loading: authLoading } = useAuth();
  const theme = useTheme();
  const checkingUpdate = useRef(false);
  const updatePromptVisible = useRef(false);
  const applyingUpdate = useRef(false);

  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    if (__DEV__ || Platform.OS !== 'android' || !Updates.isEnabled) return;

    const checkForUpdate = async () => {
      if (checkingUpdate.current || updatePromptVisible.current || applyingUpdate.current) return;
      checkingUpdate.current = true;

      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;

        updatePromptVisible.current = true;
        Alert.alert(
          'Có bản cập nhật mới',
          'PharmaShop đã có phiên bản mới. Bạn muốn tải và cập nhật ngay không?',
          [
            {
              text: 'Để sau',
              style: 'cancel',
              onPress: () => { updatePromptVisible.current = false; },
            },
            {
              text: 'Cập nhật',
              onPress: () => {
                applyingUpdate.current = true;
                void (async () => {
                  try {
                    const update = await Updates.fetchUpdateAsync();
                    if (update.isNew) {
                      await Updates.reloadAsync();
                    } else {
                      updatePromptVisible.current = false;
                      applyingUpdate.current = false;
                    }
                  } catch {
                    updatePromptVisible.current = false;
                    applyingUpdate.current = false;
                    Alert.alert('Không thể cập nhật', 'Vui lòng kiểm tra kết nối mạng và thử lại khi mở ứng dụng lần sau.');
                  }
                })();
              },
            },
          ],
          { cancelable: true, onDismiss: () => { updatePromptVisible.current = false; } },
        );
      } catch {
        // Update checks are best effort; keep the installed app usable offline.
      } finally {
        checkingUpdate.current = false;
      }
    };

    void checkForUpdate();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkForUpdate();
    });

    return () => subscription.remove();
  }, []);

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
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
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
  );
}

const styles = {
  startupPage: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 28 },
  startupLogo: { width: 132, height: 142 },
  startupTitle: { fontSize: 24, lineHeight: 31, fontWeight: '800' as const, marginTop: 18 },
  startupSubtitle: { fontSize: 14, marginTop: 4 },
  startupLoader: { marginTop: 48 },
  startupStatus: { fontSize: 12, marginTop: 16 },
};

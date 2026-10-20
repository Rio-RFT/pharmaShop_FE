import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { useEffect } from 'react';
import * as Updates from 'expo-updates';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/features/auth/auth-provider';
import { CartFlightProvider } from '@/components/cart-flight-provider';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

SplashScreen.preventAutoHideAsync();

const UPDATE_CHECK_TIMEOUT_MS = 8_000;

async function prepareAppUpdate() {
  if (__DEV__ || !Updates.isEnabled) return;

  // Do not hold the launch screen indefinitely if the device is offline or EAS is slow.
  let timedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      resolve(null);
    }, UPDATE_CHECK_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([Updates.checkForUpdateAsync(), timeout]);
    if (!result || timedOut || !result.isAvailable) return;

    const fetched = await Promise.race([Updates.fetchUpdateAsync(), timeout]);
    if (fetched && fetched.isNew && !timedOut) {
      await Updates.reloadAsync();
    }
  } catch {
    // Keep the currently installed bundle available when update checks fail.
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  useEffect(() => {
    let mounted = true;
    void (async () => {
      await prepareAppUpdate();
      if (mounted) await SplashScreen.hideAsync();
    })();
    return () => {
      mounted = false;
    };
  }, []);
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CartFlightProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="medicine/[id]" />
            <Stack.Screen name="checkout" />
            <Stack.Screen name="order/[id]" />
            <Stack.Screen name="payment/return" />
            <Stack.Screen name="payment/cancel" />
            <Stack.Screen name="auth/login" options={{ headerShown: false, presentation: 'modal' }} />
            <Stack.Screen name="auth/register" options={{ headerShown: false, presentation: 'modal' }} />
          </Stack>
          </CartFlightProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

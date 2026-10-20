import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { useEffect } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/features/auth/auth-provider';
import { CartFlightProvider } from '@/components/cart-flight-provider';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  useEffect(() => {
    void SplashScreen.hideAsync();
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

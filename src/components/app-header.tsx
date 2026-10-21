import { SymbolView } from 'expo-symbols';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, type ElementRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { getCart } from '@/features/cart/api/cart';
import { getNotifications } from '@/features/notifications/api/notifications';
import { useAuth } from '@/features/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from '@/components/themed-text';
import { useCartFlight } from '@/components/cart-flight-provider';

export function AppHeader() {
  const theme = useTheme();
  const router = useRouter();
  const targetRef = useRef<ElementRef<typeof View> | null>(null);
  const { user, guestItems } = useAuth();
  const { registerCartTarget } = useCartFlight();
  const cart = useQuery({ queryKey: ['cart'], queryFn: getCart, enabled: !!user });
  const notifications = useQuery({ queryKey: ['notifications', 'unread-count'], queryFn: () => getNotifications(1), enabled: !!user, refetchInterval: 60_000, refetchIntervalInBackground: false });
  const hasUnread = (notifications.data?.unreadCount ?? 0) > 0;
  const count = user
    ? cart.data?.items.reduce((total, item) => total + item.quantity, 0) ?? cart.data?.itemCount ?? 0
    : guestItems.reduce((total, item) => total + item.quantity, 0);

  useEffect(() => {
    registerCartTarget(targetRef.current);
    return () => registerCartTarget(null);
  }, [registerCartTarget]);

  return <View style={[styles.header, { backgroundColor: theme.background, borderBottomColor: theme.backgroundElement }]}>
    <Image source={require('../../public/logo.png')} style={styles.logo} contentFit="contain" accessibilityLabel="Logo PharmaShop" />
    <View style={styles.actions}>
      <View ref={targetRef} collapsable={false} style={styles.target}>
        <Pressable accessibilityRole="button" accessibilityLabel={count ? `Giỏ hàng, ${count} sản phẩm` : 'Giỏ hàng'} onPress={() => router.navigate('/cart')} hitSlop={8} style={styles.action}>
          <SymbolView name={{ ios: 'cart', android: 'shopping_cart', web: 'shopping_cart' }} size={22} tintColor={theme.text} />
          {count > 0 ? <View style={[styles.badge, { backgroundColor: theme.tint }]}><ThemedText style={styles.badgeText}>{count > 99 ? '99+' : count}</ThemedText></View> : null}
        </Pressable>
      </View>
      <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
      <Pressable accessibilityRole="button" accessibilityLabel="Tài khoản" onPress={() => router.navigate('/account')} hitSlop={8} style={styles.action}>
        <SymbolView name={{ ios: 'person.crop.circle', android: 'person', web: 'person' }} size={22} tintColor={theme.text} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={hasUnread ? 'Thông báo, có tin chưa đọc' : 'Thông báo'} onPress={() => router.navigate('/notifications' as import('expo-router').Href)} hitSlop={8} style={styles.action}>
        <SymbolView name={{ ios: 'bell', android: 'notifications', web: 'notifications' }} size={22} tintColor={theme.text} />
        {hasUnread ? <View accessibilityLabel="Có thông báo mới" style={styles.notificationPing} /> : null}
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  header: { height: 58, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  target: { width: 44, height: 44 },
  action: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  divider: { width: StyleSheet.hairlineWidth, height: 23, marginHorizontal: 2 },
  logo: { width: 36, height: 40 },
  badge: { position: 'absolute', top: 1, right: 0, minWidth: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#FFFFFF', fontSize: 9, lineHeight: 12, fontWeight: '800' },
  notificationPing: { position: 'absolute', top: 7, right: 7, width: 9, height: 9, borderRadius: 5, backgroundColor: '#D92D20', borderWidth: 1.5, borderColor: '#FFFFFF' },
});

import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import type { ElementRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

type ViewRef = ElementRef<typeof View>;
type Flight = { imageUrl: string | null; fromX: number; fromY: number; toX: number; toY: number };
type CartFlightContextValue = { registerCartTarget: (view: ViewRef | null) => void; flyToCart: (imageUrl: string | null, source: ViewRef | null) => void };
const CartFlightContext = createContext<CartFlightContextValue | null>(null);

export function CartFlightProvider({ children }: PropsWithChildren) {
  const targetRef = useRef<ViewRef | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const registerCartTarget = useCallback((view: ViewRef | null) => { targetRef.current = view; }, []);
  const flyToCart = useCallback((imageUrl: string | null, source: ViewRef | null) => {
    const target = targetRef.current;
    if (!source || !target) return;
    source.measureInWindow((sourceX, sourceY, sourceWidth, sourceHeight) => {
      target.measureInWindow((targetX, targetY, targetWidth, targetHeight) => {
        setFlight({ imageUrl, fromX: sourceX + sourceWidth / 2 - 25, fromY: sourceY + sourceHeight / 2 - 25, toX: targetX + targetWidth / 2 - 12, toY: targetY + targetHeight / 2 - 12 });
      });
    });
  }, []);

  useEffect(() => {
    if (!flight) return;
    progress.setValue(0);
    const animation = Animated.timing(progress, { toValue: 1, duration: 560, useNativeDriver: false });
    animation.start(({ finished }) => { if (finished) setFlight(null); });
    return () => animation.stop();
  }, [flight, progress]);

  const left = progress.interpolate({ inputRange: [0, 1], outputRange: flight ? [flight.fromX, flight.toX] : [0, 0] });
  const top = progress.interpolate({ inputRange: [0, 1], outputRange: flight ? [flight.fromY, flight.toY] : [0, 0] });
  const size = progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [50, 36, 20] });
  const opacity = progress.interpolate({ inputRange: [0, 0.88, 1], outputRange: [1, 1, 0] });

  return <CartFlightContext.Provider value={{ registerCartTarget, flyToCart }}>
    <View style={styles.root}>
      {children}
      {flight ? <Animated.View pointerEvents="none" style={[styles.flight, { left, top, width: size, height: size, opacity }]}>
        <Image source={flight.imageUrl ? { uri: flight.imageUrl } : require('../../public/logo.png')} style={styles.flightImage} contentFit="contain" />
      </Animated.View> : null}
    </View>
  </CartFlightContext.Provider>;
}

export function useCartFlight() {
  const context = useContext(CartFlightContext);
  if (!context) throw new Error('useCartFlight must be inside CartFlightProvider.');
  return context;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flight: { position: 'absolute', zIndex: 10000, borderRadius: 25, overflow: 'hidden', borderWidth: 2, borderColor: '#FFFFFF', elevation: 12 },
  flightImage: { width: '100%', height: '100%' },
});

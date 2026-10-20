import { useEffect, useRef } from 'react';
import { Animated, Easing, type ActivityIndicatorProps } from 'react-native';

export type LoadingIndicatorProps = Pick<ActivityIndicatorProps, 'color' | 'size'>;

export function LoadingIndicator({ color = '#147D68', size = 'small' }: LoadingIndicatorProps) {
  const diameter = size === 'small' ? 22 : size === 'large' ? 60 : size;
  const dotSize = diameter * 0.23;
  const progress = useRef(Array.from({ length: 5 }, () => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = progress.map((value, index) => Animated.sequence([
      Animated.delay(index * 500),
      Animated.loop(Animated.timing(value, { toValue: 1, duration: 2500, easing: Easing.linear, useNativeDriver: true })),
    ]));
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [progress]);

  return <Animated.View accessibilityRole="progressbar" accessibilityLabel="Đang tải" style={{ width: diameter, height: dotSize, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
    {progress.map((value, index) => <Animated.View key={index} style={{ position: 'absolute', left: 0, width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: color, transform: [
      { translateX: value.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, diameter * 0.5, diameter] }) },
      { scale: value.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] }) },
    ] }} />)}
  </Animated.View>;
}

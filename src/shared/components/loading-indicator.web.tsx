import { View } from 'react-native';
import { Mirage } from 'ldrs/react';
import 'ldrs/react/Mirage.css';
import type { LoadingIndicatorProps } from './loading-indicator';

export function LoadingIndicator({ color = '#147D68', size = 'small' }: LoadingIndicatorProps) {
  const diameter = size === 'small' ? 22 : size === 'large' ? 60 : size;
  const loaderColor = typeof color === 'string' ? color : '#147D68';
  return <View accessibilityRole="progressbar" accessibilityLabel="Đang tải" style={{ alignItems: 'center', justifyContent: 'center' }}>
    <Mirage size={diameter} speed="2.5" color={loaderColor} />
  </View>;
}

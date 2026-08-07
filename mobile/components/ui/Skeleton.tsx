// Skeleton rectangular con pulso. Sin librería externa —
// Animated.loop + opacity es suficiente para el MVP.

import { memo, useEffect, useState } from 'react';
import {
  Animated,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, radii } from '@/lib/theme';

interface Props {
  width?: number | `${number}%`;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

function SkeletonImpl({ width = '100%', height = 16, style }: Props) {
  const [opacity] = useState(() => new Animated.Value(0.4));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.8,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.bar,
        { width, height, opacity } as StyleProp<ViewStyle>,
        style,
      ]}
    />
  );
}

export const Skeleton = memo(SkeletonImpl);

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radii.sm,
  },
});

export function SkeletonGroup({
  count = 3,
  gap = 12,
}: {
  count?: number;
  gap?: number;
}) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={64} />
      ))}
    </View>
  );
}

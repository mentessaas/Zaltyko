// Button primario / secundario / ghost. Variantes según intención.
// Sigue el estilo del botón web: indigo-600, hover más oscuro.

import { memo, useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, radii, shadows, spacing, typography } from '@/lib/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props extends Omit<PressableProps, 'children' | 'style'> {
  title: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

function ButtonImpl({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  fullWidth,
  style,
  onPress,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;

  const handlePress = useCallback(
    (e: Parameters<NonNullable<PressableProps['onPress']>>[0]) => {
      if (!isDisabled) onPress?.(e);
    },
    [isDisabled, onPress]
  );

  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        SIZES[size],
        VARIANTS[variant].container,
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && VARIANTS[variant].pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={VARIANTS[variant].text.color} />
      ) : (
        <Text style={[styles.text, VARIANTS[variant].text]}>{title}</Text>
      )}
    </Pressable>
  );
}

export const Button = memo(ButtonImpl);

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  fullWidth: { alignSelf: 'stretch' },
  disabled: { opacity: 0.5 },
  text: {
    ...typography.label,
  },
});

const SIZES: Record<Size, ViewStyle> = {
  sm: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 36 },
  md: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 44 },
  lg: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, minHeight: 52 },
};

const VARIANTS: Record<
  Variant,
  { container: ViewStyle; pressed: ViewStyle; text: { color: string } }
> = {
  primary: {
    container: { backgroundColor: colors.primary, borderColor: colors.primary, ...shadows.sm },
    pressed: { backgroundColor: colors.primaryHover },
    text: { color: colors.primaryFg },
  },
  secondary: {
    container: { backgroundColor: colors.surface, borderColor: colors.border, ...shadows.sm },
    pressed: { backgroundColor: colors.surfaceMuted },
    text: { color: colors.text },
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    pressed: { backgroundColor: colors.surfaceMuted },
    text: { color: colors.primary },
  },
  danger: {
    container: { backgroundColor: colors.danger, borderColor: colors.danger, ...shadows.sm },
    pressed: { backgroundColor: '#B91C1C' },
    text: { color: '#FFFFFF' },
  },
};
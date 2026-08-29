// Banner de éxito inline para mutaciones. Mismo patrón visual que
// `ErrorBanner` pero con semántica WCAG opuesta: la región es "polite"
// (no interrumpe al lector de pantalla) y el rol más cercano en el
// enum de React Native a `role="status"` es `accessibilityRole="summary"`.
// Usar tras upserts / envíos exitosos.

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing, typography } from '@/lib/theme';

interface Props {
  message: string;
  onDismiss?: () => void;
}

function SuccessBannerImpl({ message, onDismiss }: Props) {
  return (
    <View
      style={styles.banner}
      accessibilityLiveRegion="polite"
      accessibilityRole="summary"
    >
      <Ionicons name="checkmark-circle" size={20} color={colors.success} />
      <Text style={styles.text} numberOfLines={3}>
        {message}
      </Text>
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          style={styles.dismiss}
          accessibilityRole="button"
          accessibilityLabel="Cerrar aviso"
        >
          <Ionicons name="close" size={16} color={colors.success} />
        </Pressable>
      ) : null}
    </View>
  );
}

export const SuccessBanner = memo(SuccessBannerImpl);

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  text: { ...typography.caption, color: colors.successText, flex: 1 },
  dismiss: { padding: spacing.xs },
});
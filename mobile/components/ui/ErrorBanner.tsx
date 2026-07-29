// Banner de error inline para mutaciones. Se muestra encima del
// contenido sin tapar la pantalla completa; cuando hay retry, el CTA
// reintenta. Usar en pantallas con forms (login, attendance, etc.).

import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing, typography } from '@/lib/theme';

interface Props {
  message: string;
  onRetry?: () => void;
  action?: ReactNode;
}

function ErrorBannerImpl({ message, onRetry, action }: Props) {
  return (
    <View
      style={styles.banner}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Ionicons name="alert-circle" size={20} color={colors.danger} />
      <Text style={styles.text} numberOfLines={3}>
        {message}
      </Text>
      {action ? (
        <View style={styles.action}>{action}</View>
      ) : onRetry ? (
        <Pressable onPress={onRetry} hitSlop={8} style={styles.retry}>
          <Ionicons name="refresh" size={16} color={colors.danger} />
        </Pressable>
      ) : null}
    </View>
  );
}

export const ErrorBanner = memo(ErrorBannerImpl);

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FEF2F2',
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  text: { ...typography.caption, color: '#991B1B', flex: 1 },
  retry: { padding: spacing.xs },
  action: { marginLeft: spacing.sm },
});
// Banner informativo inline para estados neutrales del sistema:
// sesión cancelada, mantenimiento programado, etc. No tiene CTA de
// reintento porque no es un error — es información persistente que el
// usuario debe ver hasta que el estado cambie.

import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing, typography } from '@/lib/theme';

interface Props {
  message: string;
}

function InfoBannerImpl({ message }: Props) {
  return (
    <View
      style={styles.banner}
      accessibilityLiveRegion="polite"
      accessibilityRole="text"
    >
      <Ionicons name="information-circle" size={20} color={colors.info} />
      <Text style={styles.text} numberOfLines={3}>
        {message}
      </Text>
    </View>
  );
}

export const InfoBanner = memo(InfoBannerImpl);

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#EFF6FF',
    borderColor: colors.info,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  text: { ...typography.caption, color: '#1E40AF', flex: 1 },
});

// Estado vacío reutilizable. Se muestra cuando una query devuelve []
// o cuando el filtro activo excluye todo.

import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, typography } from '@/lib/theme';

interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  action?: ReactNode;
}

function EmptyStateImpl({
  icon = 'cloud-offline-outline',
  title,
  description,
  action,
}: Props) {
  return (
    <View style={styles.wrap}>
      <Ionicons name={icon} size={48} color={colors.textMuted} />
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.desc}>{description}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

export const EmptyState = memo(EmptyStateImpl);

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.textInverse,
    textAlign: 'center',
  },
  desc: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  action: { marginTop: spacing.md },
});
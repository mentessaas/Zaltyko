// Estado vacío reutilizable. Se muestra cuando una query devuelve []
// o cuando el filtro activo excluye todo.

import { memo, useId, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, typography } from '@/lib/theme';

interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  action?: ReactNode;
  // 'dark' (default): para uso directo sobre el fondo oscuro de pantalla.
  // 'light': para uso dentro de un <Card> (superficie blanca) — si no se
  // especifica ahí, el título queda blanco sobre blanco e invisible.
  tone?: 'dark' | 'light';
}

function EmptyStateImpl({
  icon = 'cloud-offline-outline',
  title,
  description,
  action,
  tone = 'dark',
}: Props) {
  const onLight = tone === 'light';
  // WCAG: el conjunto ícono + título + descripción es una sola "imagen"
  // semántica para TalkBack/VoiceOver, evitando doble anuncio.
  const a11yLabel = description ? `${title}. ${description}` : title;
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="image"
      accessibilityLabel={a11yLabel}
    >
      <Ionicons
        name={icon}
        size={48}
        color={colors.textMuted}
        importantForAccessibility="no-hide-descendants"
        accessible={false}
      />
      <Text
        style={[styles.title, onLight && styles.titleOnLight]}
        importantForAccessibility="no-hide-descendants"
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={[styles.desc, onLight ? styles.descOnLight : styles.descOnDark]}
          importantForAccessibility="no-hide-descendants"
        >
          {description}
        </Text>
      ) : null}
      {action ? (
        <View style={styles.action} importantForAccessibility="no-hide-descendants">
          {action}
        </View>
      ) : null}
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
  titleOnLight: { color: colors.text },
  desc: {
    ...typography.body,
    textAlign: 'center',
  },
  descOnDark: { color: colors.textMutedOnDark }, // 6.96:1 sobre bg navy
  descOnLight: { color: colors.textMuted }, // 4.97:1 sobre surface blanco
  action: { marginTop: spacing.md },
});
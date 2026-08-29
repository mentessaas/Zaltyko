// Tarjeta de hijo con CTA para ver detalle. Memoizada porque las
// listas de hijos pueden ser largas en academias grandes.

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing, typography } from '@/lib/theme';
import type { FamilyChild } from '@/lib/api/endpoints';

interface Props {
  child: FamilyChild;
  onPress: () => void;
}

function ChildCardImpl({ child, onPress }: Props) {
  const initial = (child.name ?? '?').trim().charAt(0).toUpperCase();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Ver detalle de ${child.name}`}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.name}>{child.name}</Text>
        {child.academyName ? (
          <Text style={styles.academy}>{child.academyName}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

export const ChildCard = memo(ChildCardImpl);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.primary,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.title,
    color: colors.primaryFg,
  },
  body: { flex: 1, gap: 2 },
  name: { ...typography.body, color: colors.text, fontWeight: '600' },
  academy: { ...typography.caption, color: colors.textMuted },
});
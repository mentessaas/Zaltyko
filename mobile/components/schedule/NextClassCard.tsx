// Bloque "Tu próxima clase" para AthleteHome. Coherente con ClassCard
// (mismo patrón día-barra + body) pero con CTA "Ver detalle" que lleva
// a la pestaña Agenda. Empty state propio cuando no hay próxima clase
// en la ventana configurada.

import { memo, useCallback } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';

import { colors, radii, spacing, typography } from '@/lib/theme';
import type { NextClassOccurrence } from '@/lib/schedule/next-class';
import { formatNextClassWhen } from '@/lib/schedule/next-class';

interface Props {
  occurrence: NextClassOccurrence | null;
  loading?: boolean;
  onPressCta?: () => void;
}

function NextClassCardImpl({ occurrence, loading, onPressCta }: Props) {
  const handlePress = useCallback(() => {
    onPressCta?.();
  }, [onPressCta]);

  if (loading) {
    return (
      <View
        style={styles.card}
        accessibilityRole="summary"
        accessibilityLabel="Cargando tu próxima clase"
      >
        <Text style={styles.skeletonTitle}>Tu próxima clase</Text>
        <Text style={styles.skeletonLine}>Buscando tu próxima sesión…</Text>
      </View>
    );
  }

  if (!occurrence) {
    return (
      <View
        style={styles.card}
        accessibilityRole="summary"
        accessibilityLabel="No tienes clases programadas en los próximos 7 días"
      >
        <Text style={styles.title}>Tu próxima clase</Text>
        <Text style={styles.emptyMessage}>
          No tienes clases programadas en los próximos 7 días. Cuando se
          acerque una nueva sesión aparecerá aquí.
        </Text>
        {onPressCta ? (
          <Pressable
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityLabel="Ver tu agenda completa"
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          >
            <Text style={styles.ctaText}>Ver tu agenda</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const when = formatNextClassWhen(occurrence);
  const a11yLabel = `Tu próxima clase: ${occurrence.item.className}, ${when}, en ${occurrence.item.location}, con ${occurrence.item.coach}`;

  return (
    <View
      style={styles.card}
      accessibilityRole="summary"
      accessibilityLabel={a11yLabel}
    >
      <Text style={styles.title}>Tu próxima clase</Text>
      <View style={styles.row}>
        <View style={styles.dayBadge}>
          <Text style={styles.dayText} numberOfLines={1} ellipsizeMode="tail">
            {when}
          </Text>
        </View>
        <View style={styles.body}>
          <Text style={styles.className} numberOfLines={2}>
            {occurrence.item.className}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {occurrence.item.coach}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {occurrence.item.location}
          </Text>
        </View>
      </View>
      {onPressCta ? (
        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel="Ver detalle de tu próxima clase"
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaText}>Ver detalle</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const NextClassCard = memo(NextClassCardImpl);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  dayBadge: {
    minWidth: 96,
    alignItems: 'flex-start',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  dayText: {
    ...typography.label,
    color: colors.primary,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  body: { flex: 1, gap: 2 },
  className: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  cta: {
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: { backgroundColor: colors.primarySoft },
  ctaText: {
    ...typography.label,
    color: colors.primary,
    fontWeight: '600',
  },
  emptyMessage: {
    ...typography.body,
    color: colors.textMuted,
  },
  skeletonTitle: {
    ...typography.title,
    color: colors.text,
  },
  skeletonLine: {
    ...typography.body,
    color: colors.textMuted,
  },
});

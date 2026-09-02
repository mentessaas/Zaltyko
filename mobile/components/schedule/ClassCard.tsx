// Tarjeta de clase recurrente (schedule). Muestra día/hora, nombre
// de la clase, coach y ubicación.

import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/lib/theme';
import type { ScheduleItem } from '@/lib/api/endpoints';

interface Props {
  item: ScheduleItem;
}

function ClassCardImpl({ item }: Props) {
  return (
    <View
      style={styles.card}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${item.className}, ${item.day} a las ${item.time}, coach ${item.coach}${item.location ? `, en ${item.location}` : ''}`}
    >
      <View style={styles.dayBadge}>
        <Text style={styles.dayText}>{item.day.slice(0, 3).toUpperCase()}</Text>
        <Text style={styles.timeText}>{item.time}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{item.className}</Text>
        <Text style={styles.meta}>{item.coach}</Text>
        <Text style={styles.meta}>{item.location}</Text>
      </View>
    </View>
  );
}

export const ClassCard = memo(ClassCardImpl);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  dayBadge: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  dayText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  timeText: { ...typography.caption, color: colors.text },
  body: { flex: 1, gap: 2 },
  title: { ...typography.body, color: colors.text, fontWeight: '600' },
  meta: { ...typography.caption, color: colors.textMuted },
});
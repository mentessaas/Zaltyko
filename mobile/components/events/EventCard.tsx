// Tarjeta de evento próximo. CTA "Apuntarme" llama al endpoint
// /api/events/[id]/register.

import { memo, useCallback } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { registerForEvent, type UpcomingEvent } from '@/lib/api/endpoints';
import { colors, radii, spacing, typography } from '@/lib/theme';

interface Props {
  event: UpcomingEvent;
  onChanged?: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function EventCardImpl({ event, onChanged }: Props) {
  const onRegister = useCallback(async () => {
    try {
      await registerForEvent(event.id);
      Alert.alert('Listo', 'Te has apuntado al evento.');
      onChanged?.();
    } catch (err) {
      Alert.alert(
        'No se pudo apuntar',
        err instanceof Error ? err.message : 'Error desconocido'
      );
    }
  }, [event.id, onChanged]);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.dateBox}>
          <Text style={styles.date}>{formatDate(event.startDate)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{event.title}</Text>
          {event.location ? <Text style={styles.meta}>{event.location}</Text> : null}
        </View>
      </View>
      {event.description ? (
        <Text numberOfLines={2} style={styles.desc}>
          {event.description}
        </Text>
      ) : null}
      <Button title="Apuntarme" variant="secondary" onPress={onRegister} fullWidth />
    </View>
  );
}

export const EventCard = memo(EventCardImpl);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dateBox: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  date: { ...typography.label, color: colors.primaryFg, fontWeight: '700' },
  title: { ...typography.body, color: colors.text, fontWeight: '600' },
  meta: { ...typography.caption, color: colors.textMuted },
  desc: { ...typography.caption, color: colors.textMuted },
});
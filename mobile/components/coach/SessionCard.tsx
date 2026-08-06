// Tarjeta de sesión de hoy para coach. CTA "Tomar asistencia"
// navega al flujo de marcado. Muestra hora, clase y academia.

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { colors, radii, spacing, typography } from '@/lib/theme';
import { formatSessionDateTime } from '@/lib/schedule/next-class';
import type { ClassSessionRow } from '@/lib/api/endpoints';

interface Props {
  session: ClassSessionRow;
  attendanceMarked: boolean;
  onMark: () => void;
}

function formatTime(start: string | null, end: string | null): string {
  if (!start) return 'Sin hora';
  if (!end) return start.slice(0, 5);
  return `${start.slice(0, 5)} – ${end.slice(0, 5)}`;
}

function SessionCardImpl({ session, attendanceMarked, onMark }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.timeBox}>
          <Text style={styles.time}>
            {formatTime(session.startTime, session.endTime)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{session.className}</Text>
          <Text style={styles.meta}>
            {formatSessionDateTime(session.sessionDate, session.startTime)}
          </Text>
          <Text style={styles.meta}>{session.academyName}</Text>
          {session.coachName ? (
            <Text style={styles.meta}>Coach: {session.coachName}</Text>
          ) : null}
        </View>
        {attendanceMarked ? (
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
        ) : null}
      </View>
      <Pressable onPress={onMark}>
        <Button
          title={attendanceMarked ? 'Editar asistencia' : 'Tomar asistencia'}
          variant={attendanceMarked ? 'secondary' : 'primary'}
          fullWidth
        />
      </Pressable>
    </View>
  );
}

export const SessionCard = memo(SessionCardImpl);

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
  timeBox: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
  },
  time: { ...typography.label, color: colors.text, fontWeight: '700' },
  title: { ...typography.body, color: colors.text, fontWeight: '600' },
  meta: { ...typography.caption, color: colors.textMuted },
});

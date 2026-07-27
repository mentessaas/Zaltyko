// Resumen de asistencia (últimos 30 días): % de asistencia + últimos
// registros. Mismo cálculo que my-dashboard web, vía /api/me/progress.

import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, typography } from '@/lib/theme';
import type { AttendanceStats } from '@/lib/api/endpoints';

interface Props {
  data: AttendanceStats | null;
}

const STATUS_LABEL: Record<string, string> = {
  present: 'Asistió',
  absent: 'Faltó',
  excused: 'Justificada',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

function AttendanceSummaryImpl({ data }: Props) {
  if (!data || data.total === 0) {
    return (
      <EmptyState
        icon="calendar-outline"
        title="Sin asistencia registrada"
        description="Aparecerá aquí cuando el entrenador pase lista."
      />
    );
  }

  const rate = Math.round((data.present / data.total) * 100);

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.rateRow}>
        <Text style={styles.rate}>{rate}%</Text>
        <Text style={styles.rateLabel}>de asistencia en los últimos 30 días</Text>
      </View>
      <View style={styles.statsRow}>
        <Stat label="Asistió" value={data.present} color={colors.success} />
        <Stat label="Faltó" value={data.absent} color={colors.danger} />
        <Stat label="Justif." value={data.excused} color={colors.info} />
      </View>
      {data.recentRecords.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          {data.recentRecords.map((r, i) => (
            <View key={`${r.date}-${i}`} style={styles.recordRow}>
              <Text style={styles.recordDate}>{formatDate(r.date)}</Text>
              <Text style={styles.recordClass} numberOfLines={1}>
                {r.className}
              </Text>
              <Text style={styles.recordStatus}>{STATUS_LABEL[r.status] ?? r.status}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export const AttendanceSummary = memo(AttendanceSummaryImpl);

const styles = StyleSheet.create({
  rateRow: { gap: 2 },
  rate: { ...typography.display, color: colors.text },
  rateLabel: { ...typography.caption, color: colors.textMuted },
  statsRow: { flexDirection: 'row', gap: spacing.lg },
  stat: { alignItems: 'center', gap: 2 },
  statValue: { ...typography.title, fontWeight: '700' },
  statLabel: { ...typography.caption, color: colors.textMuted },
  recordRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  recordDate: { ...typography.caption, color: colors.textMuted, width: 48 },
  recordClass: { ...typography.caption, color: colors.text, flex: 1 },
  recordStatus: { ...typography.caption, color: colors.textMuted },
});

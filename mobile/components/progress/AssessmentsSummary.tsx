// Últimas evaluaciones técnicas registradas por el entrenador.
// Mismo dato que my-dashboard web, vía /api/me/progress.

import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { colors, radii, spacing, typography } from '@/lib/theme';
import type { AssessmentSummary } from '@/lib/api/endpoints';

interface Props {
  data: AssessmentSummary[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function AssessmentsSummaryImpl({ data }: Props) {
  if (data.length === 0) {
    return (
      <EmptyState
        icon="ribbon-outline"
        title="Sin evaluaciones todavía"
        description="Cuando el entrenador registre progreso técnico aparecerá aquí."
      />
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {data.map((a) => (
        <View key={a.id} style={styles.row}>
          <View style={styles.headerRow}>
            <Text style={styles.date}>{formatDate(a.assessmentDate)}</Text>
            {a.apparatus ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{a.apparatus}</Text>
              </View>
            ) : null}
          </View>
          {a.overallComment ? <Text style={styles.comment}>{a.overallComment}</Text> : null}
          {a.assessedByName ? <Text style={styles.by}>— {a.assessedByName}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export const AssessmentsSummary = memo(AssessmentsSummaryImpl);

const styles = StyleSheet.create({
  row: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { ...typography.caption, color: colors.textMuted },
  chip: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  chipText: { ...typography.caption, color: colors.text, fontWeight: '600' },
  comment: { ...typography.body, color: colors.text },
  by: { ...typography.caption, color: colors.textMuted },
});

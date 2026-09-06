// Pantalla Agenda: consume /api/me/schedule (clases recurrentes del
// atleta logueado o, si es coach/parent, las del atleta bajo su
// responsabilidad). MVP: solo lectura.

import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { ClassCard } from '@/components/schedule/ClassCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonGroup } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { RefreshableScrollView } from '@/components/ui/RefreshableScrollView';
import { getMySchedule } from '@/lib/api/endpoints';
import { colors, spacing, typography } from '@/lib/theme';

export default function ScheduleScreen() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['me', 'schedule'],
    queryFn: getMySchedule,
    staleTime: 60 * 1000,
  });

  return (
    <RefreshableScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      onRefresh={() => refetch()}
    >
      <Text style={styles.title}>Tu agenda semanal</Text>
      <Text style={styles.subtitle}>Clases en las que estás inscrito</Text>

      <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
        {isLoading ? (
          <SkeletonGroup count={4} />
        ) : error ? (
          <EmptyState
            icon="alert-circle-outline"
            title="No se pudo cargar tu agenda"
            action={<Button title="Reintentar" variant="secondary" onPress={() => refetch()} />}
          />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="Sin clases esta semana"
            description="Cuando te apuntes a una clase aparecerá aquí."
          />
        ) : (
          data.map((item) => <ClassCard key={item.id} item={item} />)
        )}
      </View>
    </RefreshableScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm },
  title: { ...typography.display, color: colors.textInverse },
  subtitle: { ...typography.body, color: colors.onDarkMuted },
});
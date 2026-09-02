// Detalle de atleta. Muestra el nombre, academia y las próximas
// clases (vía /api/athletes/[athleteId]/classes). CTA "Ver facturas".

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonGroup } from '@/components/ui/Skeleton';
import { ClassCard } from '@/components/schedule/ClassCard';
import { RefreshableScrollView } from '@/components/ui/RefreshableScrollView';
import { AttendanceSummary } from '@/components/progress/AttendanceSummary';
import { AssessmentsSummary } from '@/components/progress/AssessmentsSummary';
import { getAthleteClasses, getFamilyChildren, getMyProgress } from '@/lib/api/endpoints';
import { colors, spacing, typography } from '@/lib/theme';

export default function ChildDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Carga ligera: nombre del atleta desde la lista cacheada.
  const childrenQuery = useQuery({
    queryKey: ['family', 'children'],
    queryFn: getFamilyChildren,
    staleTime: 60 * 1000,
  });

  const child = useMemo(
    () => childrenQuery.data?.find((c) => c.id === id) ?? null,
    [childrenQuery.data, id]
  );

  const classesQuery = useQuery({
    queryKey: ['athletes', id, 'classes'],
    queryFn: () => getAthleteClasses(id ?? ''),
    enabled: !!id,
    staleTime: 60 * 1000,
  });

  const sessions = classesQuery.data ?? [];

  const progressQuery = useQuery({
    queryKey: ['progress', id],
    queryFn: () => getMyProgress(id ?? ''),
    enabled: !!id,
    staleTime: 60 * 1000,
  });

  return (
    <>
      <Stack.Screen options={{ title: child?.name ?? 'Atleta', headerBackTitle: 'Atrás' }} />
      <RefreshableScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        onRefresh={() => Promise.all([classesQuery.refetch(), progressQuery.refetch()])}
      >
        <View style={styles.header}>
          <Text style={styles.name}>{child?.name ?? 'Atleta'}</Text>
          {child?.academyName ? (
            <Text style={styles.academy}>{child.academyName}</Text>
          ) : null}
        </View>

        <Card title="Clases inscritas" subtitle="Sesiones recurrentes">
          {classesQuery.isLoading ? (
            <SkeletonGroup count={3} />
          ) : classesQuery.error ? (
            <EmptyState
              icon="alert-circle-outline"
              title="No se pudieron cargar las clases"
              tone="light"
            />
          ) : sessions.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title="Aún no está inscrito"
              description="Inscribe al atleta desde la agenda para ver sus clases aquí."
              tone="light"
            />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {sessions.map((s) => (
                <ClassCard
                  key={s.id}
                  item={{
                    id: s.id,
                    className: s.className,
                    day: s.dayOfWeek !== undefined
                      ? ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][s.dayOfWeek] ?? ''
                      : '',
                    time: `${s.startTime} – ${s.endTime}`,
                    location: s.location ?? 'Por asignar',
                    coach: s.coachName ?? 'Por asignar',
                  }}
                />
              ))}
            </View>
          )}
        </Card>

        <Card title="Asistencia" subtitle="Últimos 30 días">
          {progressQuery.isLoading ? (
            <SkeletonGroup count={2} />
          ) : progressQuery.error ? (
            <EmptyState icon="alert-circle-outline" title="No se pudo cargar la asistencia" tone="light" />
          ) : (
            <AttendanceSummary data={progressQuery.data?.attendance ?? null} />
          )}
        </Card>

        <Card title="Progreso técnico" subtitle="Últimas evaluaciones">
          {progressQuery.isLoading ? (
            <SkeletonGroup count={2} />
          ) : progressQuery.error ? (
            <EmptyState icon="alert-circle-outline" title="No se pudo cargar el progreso" tone="light" />
          ) : (
            <AssessmentsSummary data={progressQuery.data?.assessments ?? []} />
          )}
        </Card>

        <Card title="Facturas">
          <Button
            title="Ver facturas y pagar"
            variant="primary"
            fullWidth
            onPress={() => router.push('/family/invoices')}
          />
        </Card>
      </RefreshableScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  header: { gap: spacing.xs },
  name: { ...typography.display, color: colors.textInverse },
  academy: { ...typography.body, color: colors.onDarkMuted },
});
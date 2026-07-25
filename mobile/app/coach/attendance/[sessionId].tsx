// Página de toma de asistencia para una sesión.
// 1. Carga la sesión individual (GET /api/class-sessions/:id) para
//    resolver classId sin descargar la lista completa.
// 2. Carga atletas de la clase y asistencia existente en paralelo.
// 3. El estado local (athleteId → status) se inicializa con la
//    asistencia existente; los cambios se aplican localmente y el
//    botón "Guardar" envía un upsert batch a /api/attendance.

import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';

import { StudentRow } from '@/components/attendance/StudentRow';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { SkeletonGroup } from '@/components/ui/Skeleton';
import {
  getClassAthletes,
  getClassSession,
  getSessionAttendance,
  upsertAttendance,
  type AttendanceStatus,
} from '@/lib/api/endpoints';
import { colors, spacing, typography } from '@/lib/theme';

export default function AttendanceScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  const sessionQuery = useQuery({
    queryKey: ['class-sessions', sessionId],
    queryFn: () => getClassSession(sessionId ?? ''),
    enabled: !!sessionId,
    staleTime: 60 * 1000,
  });
  const classId = sessionQuery.data?.classId;

  const athletesQuery = useQuery({
    queryKey: ['classes', classId, 'athletes'],
    queryFn: () => getClassAthletes(classId ?? ''),
    enabled: !!classId,
    staleTime: 60 * 1000,
  });

  const attendanceQuery = useQuery({
    queryKey: ['attendance', sessionId],
    queryFn: () => getSessionAttendance(sessionId ?? ''),
    enabled: !!sessionId,
    staleTime: 30 * 1000,
  });

  // Estado local: athleteId → status. Inicializa con lo que devuelve el backend.
  const [statusMap, setStatusMap] = useState<Record<string, AttendanceStatus>>({});
  useEffect(() => {
    if (!attendanceQuery.data) return;
    const next: Record<string, AttendanceStatus> = {};
    for (const r of attendanceQuery.data) {
      next[r.athleteId] = r.status;
    }
    setStatusMap(next);
  }, [attendanceQuery.data]);

  const onChange = useCallback((athleteId: string, status: AttendanceStatus) => {
    setStatusMap((prev) => ({ ...prev, [athleteId]: status }));
  }, []);

  const saveMutation = useMutation({
    mutationFn: () => {
      const entries = Object.entries(statusMap).map(([athleteId, status]) => ({
        athleteId,
        status,
      }));
      return upsertAttendance(sessionId ?? '', entries);
    },
    onSuccess: () => {
      Alert.alert('Guardado', 'Asistencia registrada.');
      attendanceQuery.refetch();
    },
  });

  const athletes = athletesQuery.data ?? [];
  const session = sessionQuery.data;

  return (
    <>
      <Stack.Screen options={{ title: 'Asistencia', headerBackTitle: 'Atrás' }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        {session ? (
          <View style={styles.header}>
            <Text style={styles.title}>Sesión del {session.sessionDate}</Text>
            <Text style={styles.meta}>
              {session.startTime ? `${session.startTime.slice(0, 5)}` : 'Sin hora'}
              {session.endTime ? ` – ${session.endTime.slice(0, 5)}` : ''}
            </Text>
            <Text style={styles.meta}>
              {Object.keys(statusMap).length} de {athletes.length} marcados
            </Text>
          </View>
        ) : null}

        {saveMutation.error ? (
          <ErrorBanner
            message={
              saveMutation.error instanceof Error
                ? saveMutation.error.message
                : 'No se pudo guardar la asistencia'
            }
            onRetry={() => saveMutation.mutate()}
          />
        ) : null}

        {athletesQuery.isLoading || sessionQuery.isLoading ? (
          <SkeletonGroup count={6} />
        ) : athletesQuery.error ? (
          <EmptyState
            icon="alert-circle-outline"
            title="No se pudieron cargar los atletas"
          />
        ) : athletes.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="Sin atletas inscritos"
            description="Cuando se inscriban atletas aparecerán aquí."
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {athletes.map((a) => (
              <StudentRow
                key={a.id}
                athleteId={a.id}
                name={a.name}
                groupName={a.groupName}
                status={statusMap[a.id] ?? null}
                onChange={onChange}
              />
            ))}
          </View>
        )}

        {athletes.length > 0 ? (
          <Button
            title={saveMutation.isPending ? 'Guardando…' : 'Guardar asistencia'}
            variant="primary"
            fullWidth
            disabled={saveMutation.isPending}
            onPress={() => saveMutation.mutate()}
          />
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  header: { gap: spacing.xs },
  title: { ...typography.display, color: colors.textInverse },
  meta: { ...typography.body, color: '#94A3B8' },
});
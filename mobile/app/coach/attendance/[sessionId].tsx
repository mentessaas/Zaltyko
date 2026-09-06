// Página de toma de asistencia para una sesión.
// 1. Carga la sesión individual (GET /api/class-sessions/:id) para
//    resolver classId sin descargar la lista completa.
// 2. Carga atletas de la clase y asistencia existente en paralelo.
// 3. El estado local (athleteId → status) se inicializa con la
//    asistencia existente; los cambios se aplican localmente y el
//    botón "Guardar" envía un upsert batch a /api/attendance.
//
// ZAL-622 Phase 1 (AC-03 + AC-09 + AC-10 del contrato ZAL-619):
//   - Sesión cancelada bloquea la UI: "Solo sesiones no canceladas
//     aceptan asistencia".
//   - Distinción visible entre cambios pendientes de guardar y
//     confirmados: el banner y el contador muestran dirty count.
//   - Idempotency-Key generada cliente y persistida en AsyncStorage
//     por (kind, payloadHash); reintentos reusan la misma clave.

import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';

import { StudentRow } from '@/components/attendance/StudentRow';
import { AssessmentModal } from '@/components/coach/AssessmentModal';
import { GroupAlertModal } from '@/components/coach/GroupAlertModal';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { InfoBanner } from '@/components/ui/InfoBanner';
import { SkeletonGroup } from '@/components/ui/Skeleton';
import { SuccessBanner } from '@/components/ui/SuccessBanner';
import { useSession } from '@/lib/auth/use-session';
import {
  getClassAthletes,
  getClassSession,
  getSessionAttendance,
  upsertAttendance,
  type AttendanceStatus,
} from '@/lib/api/endpoints';
import { getOrCreateIdempotencyKey } from '@/lib/api/idempotency';
import { ApiClientError } from '@/lib/api/client';
import { colors, spacing, typography } from '@/lib/theme';
import { formatSessionDateTime } from '@/lib/schedule/next-class';

export default function AttendanceScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { profile } = useSession();

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

  const persistedStatusMap = useMemo(() => {
    const next: Record<string, AttendanceStatus> = {};
    for (const r of attendanceQuery.data ?? []) {
      next[r.athleteId] = r.status;
    }
    return next;
  }, [attendanceQuery.data]);
  const [statusOverrides, setStatusOverrides] = useState<
    Record<string, AttendanceStatus>
  >({});
  const statusMap = useMemo(
    () => ({ ...persistedStatusMap, ...statusOverrides }),
    [persistedStatusMap, statusOverrides],
  );

  // ZAL-619 §5 + ZAL-622 §3 AC-03: sesiones `cancelled` no aceptan
  // asistencia. La UI debe bloquear ANTES de que el coach envíe nada
  // para no generar errores inútiles contra el backend.
  const session = sessionQuery.data;
  const isCancelled = session?.status === 'cancelled';

  const onChange = useCallback(
    (athleteId: string, status: AttendanceStatus) => {
      if (isCancelled) return; // guard: no registrar cambios si cancelada
      setStatusOverrides((prev) => ({ ...prev, [athleteId]: status }));
    },
    [isCancelled],
  );

  const [evaluating, setEvaluating] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [showGroupAlert, setShowGroupAlert] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // ZAL-622 §4 Fase 1: idempotencia cliente. La clave se genera por
  // (kind, payloadHash); un reintento por error de red reusa la misma
  // clave para que el backend (cuando lo soporte) devuelva el mismo
  // resultado. Mientras tanto, el upsert SQL es naturalmente idempotente.
  const dirtyCount = Object.keys(statusOverrides).length;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(statusMap).map(([athleteId, status]) => ({
        athleteId,
        status,
      }));
      // El payload que identifica el "intento lógico" del usuario es
      // (sessionId, entries). Cualquier cambio en entries antes de guardar
      // da un hash distinto y por tanto una clave nueva — eso es lo que
      // queremos: cada envío deliberado del coach es un intento nuevo.
      const { key } = await getOrCreateIdempotencyKey('attendance.upsert', {
        sessionId,
        entries,
      });
      return upsertAttendance(sessionId ?? '', entries, {
        idempotencyKey: key,
      });
    },
    onMutate: () => {
      // Limpia avisos anteriores para que no quede stale.
      setSavedNotice(null);
    },
    onSuccess: async () => {
      setSavedNotice('Asistencia guardada.');
      await attendanceQuery.refetch();
      setStatusOverrides({});
    },
    // Si falla, NO limpiamos overrides — el contrato exige conservar el
    // estado local no confirmado y ofrecer reintento (AC-10).
  });

  const athletes = athletesQuery.data ?? [];
  const saveError = saveMutation.error;
  // canSave se calcula DESPUÉS de saveMutation para evitar la TDZ.
  const canSave =
    !isCancelled &&
    athletes.length > 0 &&
    dirtyCount > 0 &&
    !saveMutation.isPending;

  return (
    <>
      <Stack.Screen
        options={{ title: 'Asistencia', headerBackTitle: 'Atrás' }}
      />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        {session ? (
          <View style={styles.header}>
            <Text style={styles.title}>
              Sesión del{' '}
              {formatSessionDateTime(session.sessionDate, session.startTime)}
            </Text>
            <Text style={styles.meta}>
              {session.startTime
                ? `${session.startTime.slice(0, 5)}`
                : 'Sin hora'}
              {session.endTime ? ` – ${session.endTime.slice(0, 5)}` : ''}
            </Text>
            <Text style={styles.meta}>
              {Object.keys(statusMap).length} de {athletes.length} marcados
              {dirtyCount > 0 && !isCancelled
                ? ` · ${dirtyCount} sin guardar`
                : ''}
            </Text>
            {profile?.academyId && !isCancelled ? (
              <Button
                title="Enviar aviso al grupo"
                variant="secondary"
                onPress={() => setShowGroupAlert(true)}
              />
            ) : null}
          </View>
        ) : null}

        {isCancelled ? (
          <InfoBanner
            message="Esta sesión fue cancelada. No se puede registrar asistencia."
          />
        ) : null}

        {savedNotice ? (
          <SuccessBanner
            message={savedNotice}
            onDismiss={() => setSavedNotice(null)}
          />
        ) : null}

        {saveError ? (
          <ErrorBanner
            // Mensaje SIEMPRE desde ApiClientError (que ya pasó por
            // translateError) — nunca del backend crudo. AC-10.
            message={
              saveError instanceof ApiClientError
                ? saveError.message
                : 'No se pudo guardar la asistencia. Toca para reintentar.'
            }
            onRetry={canSave ? () => saveMutation.mutate() : undefined}
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
                // Marca filas con cambios pendientes de guardar — pista
                // visual sutil sin inventar un estado nuevo.
                dirty={Object.prototype.hasOwnProperty.call(statusOverrides, a.id)}
                onChange={onChange}
                onEvaluate={(id, name) => setEvaluating({ id, name })}
              />
            ))}
          </View>
        )}

        {athletes.length > 0 ? (
          <Button
            title={
              saveMutation.isPending
                ? 'Guardando…'
                : dirtyCount === 0
                  ? 'Sin cambios pendientes'
                  : `Guardar (${dirtyCount})`
            }
            variant="primary"
            fullWidth
            disabled={!canSave}
            onPress={() => saveMutation.mutate()}
          />
        ) : null}
      </ScrollView>

      <AssessmentModal
        athlete={evaluating}
        sessionId={sessionId}
        onClose={() => setEvaluating(null)}
        onSaved={() => Alert.alert('Guardado', 'Progreso registrado.')}
      />

      {profile?.academyId && sessionId && !isCancelled ? (
        <GroupAlertModal
          visible={showGroupAlert}
          academyId={profile.academyId}
          sessionId={sessionId}
          onClose={() => setShowGroupAlert(false)}
          onSent={(count) =>
            Alert.alert(
              'Enviado',
              `Aviso entregado a ${count} familia(s)/atleta(s).`,
            )
          }
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  header: { gap: spacing.xs },
  title: { ...typography.display, color: colors.textInverse },
  meta: { ...typography.body, color: colors.onDarkMuted },
});

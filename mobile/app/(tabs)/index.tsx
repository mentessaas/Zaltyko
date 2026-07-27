// Home adaptado por rol. Cada rol ve un contenido distinto:
//   - parent: lista real de hijos + eventos próximos
//   - coach: sesiones de hoy, CTA para tomar asistencia
//   - athlete: shell
//   - owner/admin: shell — dashboard real en Fase 2

import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { ChildCard } from '@/components/family/ChildCard';
import { EventCard } from '@/components/events/EventCard';
import { SessionCard } from '@/components/coach/SessionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonGroup } from '@/components/ui/Skeleton';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { RefreshableScrollView } from '@/components/ui/RefreshableScrollView';
import { AttendanceSummary } from '@/components/progress/AttendanceSummary';
import { AssessmentsSummary } from '@/components/progress/AssessmentsSummary';
import { useSession } from '@/lib/auth/use-session';
import {
  getFamilyChildren,
  getUpcomingEvents,
  getSessions,
  getMyProgress,
  getMyKpis,
} from '@/lib/api/endpoints';
import { colors, spacing, typography } from '@/lib/theme';

export default function HomeScreen() {
  const { profile } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  if (!profile) return null;

  const onRefresh = async () => {
    // Invalidación broad: refetch de las queries del home según rol.
    const tasks: Promise<unknown>[] = [];
    if (profile.role === 'parent') {
      tasks.push(queryClient.invalidateQueries({ queryKey: ['family', 'children'] }));
      tasks.push(queryClient.invalidateQueries({ queryKey: ['events', 'upcoming'] }));
    }
    if (profile.role === 'coach') {
      tasks.push(queryClient.invalidateQueries({ queryKey: ['class-sessions'] }));
    }
    if (profile.role === 'athlete') {
      tasks.push(queryClient.invalidateQueries({ queryKey: ['progress'] }));
    }
    if (profile.role === 'owner' || profile.role === 'admin' || profile.role === 'super_admin') {
      tasks.push(queryClient.invalidateQueries({ queryKey: ['kpis'] }));
    }
    await Promise.all(tasks);
  };

  return (
    <RefreshableScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      onRefresh={onRefresh}
    >
      <View style={styles.header}>
        <Text style={styles.hello}>Hola, {profile.fullName ?? 'bienvenido'}</Text>
        {profile.academyName ? (
          <Text style={styles.academy}>{profile.academyName}</Text>
        ) : null}
      </View>

      {profile.role === 'parent' ? <ParentHome /> : null}
      {profile.role === 'coach' ? <CoachHome /> : null}
      {profile.role === 'athlete' ? <AthleteHome /> : null}
      {(profile.role === 'owner' ||
        profile.role === 'admin' ||
        profile.role === 'super_admin') ? (
        <AdminHome />
      ) : null}

      <Card title="Atajos" style={styles.card}>
        <Button
          title="Ir a la agenda"
          variant="secondary"
          fullWidth
          onPress={() => router.push('/(tabs)/schedule')}
        />
        <Button
          title="Ver avisos"
          variant="ghost"
          fullWidth
          onPress={() => router.push('/(tabs)/notifications')}
        />
      </Card>
    </RefreshableScrollView>
  );
}

function ParentHome() {
  const router = useRouter();
  const childrenQuery = useQuery({
    queryKey: ['family', 'children'],
    queryFn: getFamilyChildren,
    staleTime: 60 * 1000,
  });
  const eventsQuery = useQuery({
    queryKey: ['events', 'upcoming'],
    queryFn: () => getUpcomingEvents(),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <>
      <Card title="Tus hijos" subtitle="Toca uno para ver su agenda">
        {childrenQuery.isLoading ? (
          <SkeletonGroup count={3} />
        ) : childrenQuery.error ? (
          <EmptyState
            icon="alert-circle-outline"
            title="No se pudieron cargar"
            action={
              <Button
                title="Reintentar"
                variant="secondary"
                onPress={() => childrenQuery.refetch()}
              />
            }
          />
        ) : !childrenQuery.data || childrenQuery.data.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="Sin hijos vinculados"
            description="Si acabas de crear tu cuenta, el equipo de tu academia te vinculará pronto."
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {childrenQuery.data.map((child) => (
              <ChildCard
                key={child.id}
                child={child}
                onPress={() => router.push(`/family/child/${child.id}`)}
              />
            ))}
          </View>
        )}
      </Card>

      <Card title="Próximos eventos" subtitle="De tu academia">
        {eventsQuery.isLoading ? (
          <SkeletonGroup count={2} />
        ) : eventsQuery.error ? (
          <EmptyState icon="alert-circle-outline" title="No se pudieron cargar" />
        ) : !eventsQuery.data || eventsQuery.data.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="Sin eventos próximos"
            description="Cuando se publiquen nuevos eventos aparecerán aquí."
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {eventsQuery.data.slice(0, 3).map((ev) => (
              <EventCard
                key={ev.id}
                event={ev}
                onChanged={() => eventsQuery.refetch()}
              />
            ))}
          </View>
        )}
      </Card>
    </>
  );
}

function CoachHome() {
  const router = useRouter();

  const sessionsQuery = useQuery({
    // La fecha se evalúa en queryFn para que un refetch tras la
    // medianoche use el día actual, no el congelado en mount.
    queryKey: ['class-sessions', 'today'],
    queryFn: () => {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const today = `${yyyy}-${mm}-${dd}`;
      return getSessions({ from: today, to: today });
    },
    staleTime: 60 * 1000,
  });

  const sessions = sessionsQuery.data ?? [];

  return (
    <Card
      title="Clases de hoy"
      subtitle={
        sessions.length > 0
          ? `${sessions.length} sesiones programadas`
          : 'Toma asistencia desde tu móvil'
      }
    >
      {sessionsQuery.isLoading ? (
        <SkeletonGroup count={2} />
      ) : sessionsQuery.error ? (
        <EmptyState icon="alert-circle-outline" title="No se pudieron cargar" />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="Sin clases hoy"
          description="Cuando haya sesiones programadas aparecerán aquí."
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {sessions.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              attendanceMarked={s.status === 'completed'}
              onMark={() => router.push(`/coach/attendance/${s.id}`)}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

function AthleteHome() {
  const progressQuery = useQuery({
    queryKey: ['progress'],
    queryFn: () => getMyProgress(),
    staleTime: 60 * 1000,
  });

  return (
    <>
      <Card title="Asistencia" subtitle="Últimos 30 días">
        {progressQuery.isLoading ? (
          <SkeletonGroup count={2} />
        ) : progressQuery.error ? (
          <EmptyState icon="alert-circle-outline" title="No se pudo cargar la asistencia" />
        ) : (
          <AttendanceSummary data={progressQuery.data?.attendance ?? null} />
        )}
      </Card>

      <Card title="Progreso técnico" subtitle="Últimas evaluaciones">
        {progressQuery.isLoading ? (
          <SkeletonGroup count={2} />
        ) : progressQuery.error ? (
          <EmptyState icon="alert-circle-outline" title="No se pudo cargar el progreso" />
        ) : (
          <AssessmentsSummary data={progressQuery.data?.assessments ?? []} />
        )}
      </Card>
    </>
  );
}

function AdminHome() {
  const kpisQuery = useQuery({
    queryKey: ['kpis'],
    queryFn: getMyKpis,
    staleTime: 60 * 1000,
  });

  const kpis = kpisQuery.data;

  return (
    <Card title="Resumen" subtitle="De un vistazo — reportes completos en la web">
      {kpisQuery.isLoading ? (
        <SkeletonGroup count={2} />
      ) : kpisQuery.error ? (
        <EmptyState icon="alert-circle-outline" title="No se pudieron cargar los KPIs" />
      ) : (
        <View style={styles.kpiGrid}>
          <KpiTile label="Atletas" value={kpis?.athletes ?? 0} />
          <KpiTile label="Entrenadores" value={kpis?.coaches ?? 0} />
          <KpiTile label="Grupos" value={kpis?.groups ?? 0} />
          <KpiTile label="Clases esta semana" value={kpis?.classesThisWeek ?? 0} />
          <KpiTile label="Evaluaciones" value={kpis?.assessments ?? 0} />
          <KpiTile label="Asistencia (7 días)" value={`${kpis?.attendancePercent ?? 0}%`} />
        </View>
      )}
    </Card>
  );
}

function KpiTile({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.kpiTile}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  hello: {
    ...typography.display,
    color: colors.textInverse,
  },
  academy: {
    ...typography.caption,
    color: '#94A3B8',
  },
  card: { gap: spacing.md },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  kpiTile: { width: '30%', gap: 2 },
  kpiValue: { ...typography.title, color: colors.text, fontWeight: '700' },
  kpiLabel: { ...typography.caption, color: colors.textMuted },
});
// Home adaptado por rol. Cada rol ve un contenido distinto:
<<<<<<< HEAD
//   - parent: my-dashboard bundle (próx. clases, avisos no leídos,
//     cargos pendientes) + lista real de hijos (Fase 5, ZAL-622)
//   - coach: sesiones de hoy, CTA para tomar asistencia
//   - athlete: shell
//   - owner/admin: bundle de atención compartido Web/Mobile (Fase 2, ZAL-622)

import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
=======
//   - parent: lista real de hijos + eventos próximos
//   - coach: sesiones de hoy, CTA para tomar asistencia
//   - athlete: shell
//   - owner/admin: shell — dashboard real en Fase 2

import { StyleSheet, Text, View } from 'react-native';
>>>>>>> origin/main
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { ChildCard } from '@/components/family/ChildCard';
import { EventCard } from '@/components/events/EventCard';
import { SessionCard } from '@/components/coach/SessionCard';
import { NextClassCard } from '@/components/schedule/NextClassCard';
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
<<<<<<< HEAD
  getMySchedule,
} from '@/lib/api/endpoints';
import {
  getAttention,
  renderCount,
  type OwnerAttentionBundle,
  type TodaySession,
} from '@/lib/api/dashboard';
import {
  getFamilyDashboard,
  renderFamilyCount,
  type FamilyDashboardBundle,
  type ScheduleItem,
} from '@/lib/api/family-dashboard';
=======
  getMyKpis,
  getMySchedule,
} from '@/lib/api/endpoints';
>>>>>>> origin/main
import { nextClassFromSchedule } from '@/lib/schedule/next-class';
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
<<<<<<< HEAD
      // Fase 5 (AC-08): my-dashboard de la familia.
      tasks.push(queryClient.invalidateQueries({ queryKey: ['family', 'dashboard'] }));
=======
>>>>>>> origin/main
    }
    if (profile.role === 'coach') {
      tasks.push(queryClient.invalidateQueries({ queryKey: ['class-sessions'] }));
    }
    if (profile.role === 'athlete') {
      tasks.push(queryClient.invalidateQueries({ queryKey: ['progress'] }));
      tasks.push(queryClient.invalidateQueries({ queryKey: ['me', 'schedule'] }));
    }
    if (profile.role === 'owner' || profile.role === 'admin' || profile.role === 'super_admin') {
<<<<<<< HEAD
      tasks.push(queryClient.invalidateQueries({ queryKey: ['dashboard', 'attention'] }));
=======
      tasks.push(queryClient.invalidateQueries({ queryKey: ['kpis'] }));
>>>>>>> origin/main
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
<<<<<<< HEAD
        <AdminHome academyId={profile.academyId} />
=======
        <AdminHome />
>>>>>>> origin/main
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
<<<<<<< HEAD
  // Fase 5 (AC-08): my-dashboard de la familia. Compone próximas
  // clases, avisos no leídos y cargos pendientes en paralelo. Una
  // fuente caída NO oculta las otras dos (aislamiento de fallos en
  // `getFamilyDashboard`); un error contractual (AUTH_REQUIRED /
  // FORBIDDEN_ROLE) sí rechaza para que la UI muestre error, no
  // "Sin datos".
  const familyDashboardQuery = useQuery<FamilyDashboardBundle>({
    queryKey: ['family', 'dashboard'],
    queryFn: getFamilyDashboard,
    staleTime: 60 * 1000,
  });
=======
>>>>>>> origin/main

  return (
    <>
      <Card title="Tus hijos" subtitle="Toca uno para ver su agenda">
        {childrenQuery.isLoading ? (
          <SkeletonGroup count={3} />
        ) : childrenQuery.error ? (
          <EmptyState
            icon="alert-circle-outline"
            title="No se pudieron cargar"
            tone="light"
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
            tone="light"
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

<<<<<<< HEAD
      <NextClassesCard block={familyDashboardQuery.data?.nextClasses} loading={familyDashboardQuery.isLoading} />

      <UnreadCard block={familyDashboardQuery.data?.unread} loading={familyDashboardQuery.isLoading} />

      <PendingChargesCard
        block={familyDashboardQuery.data?.pendingCharges}
        loading={familyDashboardQuery.isLoading}
      />

=======
>>>>>>> origin/main
      <Card title="Próximos eventos" subtitle="De tu academia">
        {eventsQuery.isLoading ? (
          <SkeletonGroup count={2} />
        ) : eventsQuery.error ? (
          <EmptyState icon="alert-circle-outline" title="No se pudieron cargar" tone="light" />
        ) : !eventsQuery.data || eventsQuery.data.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="Sin eventos próximos"
            description="Cuando se publiquen nuevos eventos aparecerán aquí."
            tone="light"
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

<<<<<<< HEAD
function NextClassesCard({
  block,
  loading,
}: {
  block: FamilyDashboardBundle['nextClasses'] | undefined;
  loading: boolean;
}) {
  const router = useRouter();
  if (loading) {
    return (
      <Card title="Tus próximas clases">
        <SkeletonGroup count={2} />
      </Card>
    );
  }
  if (!block) return null;
  return (
    <Card title="Tus próximas clases" subtitle="Agenda de tus hijos">
      {!block.sourceAvailable ? (
        <Text style={styles.tileMuted}>Fuente no disponible</Text>
      ) : block.items.length === 0 ? (
        <Text style={styles.tileMuted}>Sin clases próximas</Text>
      ) : (
        <View style={{ gap: spacing.xs }}>
          {block.items.map((cls: ScheduleItem) => (
            <PressableScheduleRow
              key={cls.id}
              cls={cls}
              onPress={() => router.push('/(tabs)/schedule')}
            />
          ))}
        </View>
      )}
      <Button
        title="Ver agenda completa"
        variant="secondary"
        fullWidth
        onPress={() => router.push(block.href)}
      />
    </Card>
  );
}

function PressableScheduleRow({
  cls,
  onPress,
}: {
  cls: ScheduleItem;
  onPress: () => void;
}) {
  // Pressable envuelve la fila completa para que el touch target
  // supere 44pt (Fase 9 transversal).
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${cls.className}, ${cls.day} ${cls.time}`}
      style={styles.scheduleRow}
    >
      <Text style={styles.scheduleClass}>{cls.className}</Text>
      <Text style={styles.scheduleWhen}>{cls.day} · {cls.time}</Text>
    </Pressable>
  );
}

function UnreadCard({
  block,
  loading,
}: {
  block: FamilyDashboardBundle['unread'] | undefined;
  loading: boolean;
}) {
  const router = useRouter();
  if (loading) {
    return (
      <Card title="Avisos y mensajes">
        <SkeletonGroup count={2} />
      </Card>
    );
  }
  if (!block) return null;
  const display = renderFamilyCount({
    count: block.notifications + block.conversations,
    sourceAvailable: block.sourceAvailable,
  });
  let body: string;
  if (display.kind === 'unavailable') {
    body = 'Fuente no disponible';
  } else if (display.kind === 'empty') {
    body = 'Sin avisos pendientes';
  } else {
    body = `${display.value} sin leer`;
  }
  return (
    <Card title="Avisos y mensajes" subtitle="Notificaciones y conversaciones">
      {!block.sourceAvailable ? (
        <Text style={styles.tileMuted}>Fuente no disponible</Text>
      ) : (
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.lineItem}>Notificaciones: {block.notifications}</Text>
          <Text style={styles.lineItem}>Conversaciones: {block.conversations}</Text>
          <Text style={styles.summaryLine}>{body}</Text>
        </View>
      )}
      <Button
        title="Ver avisos"
        variant="secondary"
        fullWidth
        onPress={() => router.push(block.href)}
      />
    </Card>
  );
}

function PendingChargesCard({
  block,
  loading,
}: {
  block: FamilyDashboardBundle['pendingCharges'] | undefined;
  loading: boolean;
}) {
  const router = useRouter();
  if (loading) {
    return (
      <Card title="Cargos pendientes">
        <SkeletonGroup count={2} />
      </Card>
    );
  }
  if (!block) return null;
  return (
    <Card title="Cargos pendientes" subtitle="Cuotas por pagar de tus hijos">
      {!block.sourceAvailable ? (
        <Text style={styles.tileMuted}>Fuente no disponible</Text>
      ) : block.items.length === 0 ? (
        <Text style={styles.tileMuted}>Sin cargos pendientes</Text>
      ) : (
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.lineItem}>
            {block.items.length} {block.items.length === 1 ? 'cargo por pagar' : 'cargos por pagar'}
          </Text>
        </View>
      )}
      <Button
        title="Ver cargos"
        variant="secondary"
        fullWidth
        onPress={() => router.push(block.href)}
      />
    </Card>
  );
}

=======
>>>>>>> origin/main
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
        <EmptyState icon="alert-circle-outline" title="No se pudieron cargar" tone="light" />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="Sin clases hoy"
          description="Cuando haya sesiones programadas aparecerán aquí."
          tone="light"
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
  const router = useRouter();
  const progressQuery = useQuery({
    queryKey: ['progress'],
    queryFn: () => getMyProgress(),
    staleTime: 60 * 1000,
  });
  const scheduleQuery = useQuery({
    queryKey: ['me', 'schedule'],
    queryFn: getMySchedule,
    staleTime: 60 * 1000,
  });

  const goToSchedule = () => router.push('/(tabs)/schedule');

  return (
    <>
      <NextClassCard
        loading={scheduleQuery.isLoading}
        occurrence={nextClassFromSchedule(scheduleQuery.data)}
        onPressCta={goToSchedule}
      />

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
    </>
  );
}

<<<<<<< HEAD
function AdminHome({ academyId }: { academyId: string | null }) {
  // El contrato ZAL-619 §6.2 + ZAL-635 fija el shape compartido Web/Mobile
  // para el bundle "attention". Reemplaza al antiguo getMyKpis() (números
  // desnudos, ?? 0) por bloques con enlaces y estados vacío/error/parcial
  // explícitos. Render correcto para owner/admin/super_admin; para coach
  // se mantiene CoachHome y un refactor a view=coach queda en Fase 9.
  const router = useRouter();
  const attentionQuery = useQuery({
    queryKey: ['dashboard', 'attention', academyId, 'owner'],
    queryFn: () => {
      if (!academyId) {
        // El servidor rechaza sin academyId; cortocircuitar en cliente
        // para no mostrar "Cargando…" infinito cuando el perfil todavía
        // no tiene academia asignada (caso soporte o cuenta recién creada).
        return Promise.reject(new Error('ACADEMY_REQUIRED'));
      }
      return getAttention(academyId, 'owner') as Promise<OwnerAttentionBundle>;
    },
    enabled: !!academyId,
    staleTime: 60 * 1000,
  });

  if (!academyId) {
    return (
      <Card title="Resumen">
        <EmptyState
          icon="business-outline"
          title="Sin academia asignada"
          description="Cuando formes parte de una academia verás aquí el panel operativo."
          tone="light"
        />
      </Card>
    );
  }

  if (attentionQuery.isLoading) {
    return (
      <Card title="Resumen" subtitle="De un vistazo">
        <SkeletonGroup count={3} />
      </Card>
    );
  }

  if (attentionQuery.error) {
    // ApiClientError ya pasó por translateError: el .message es seguro.
    const err = attentionQuery.error as Error & { message?: string };
    return (
      <Card title="Resumen" subtitle="De un vistazo">
        <EmptyState
          icon="alert-circle-outline"
          title="No se pudo cargar el panel"
          description={err.message ?? 'Reintenta en unos segundos.'}
          tone="light"
          action={
            <Button
              title="Reintentar"
              variant="secondary"
              onPress={() => attentionQuery.refetch()}
            />
          }
        />
      </Card>
    );
  }

  const bundle = attentionQuery.data;
  if (!bundle) return null;

  return (
    <>
      {bundle.priorityAction ? (
        <PriorityActionBanner
          label={bundle.priorityAction.label}
          onOpen={() => openHref(router, bundle.priorityAction!.href)}
        />
      ) : null}

      {bundle.importActive ? (
        <ImportActiveCard
          state={bundle.importActive.state}
          filename={bundle.importActive.filename}
          onOpen={() => openHref(router, bundle.importActive!.href)}
        />
      ) : null}

      <TodaySessionsCard today={bundle.today} />

      <BlockTile
        title="Asistencia pendiente"
        display={renderCount(bundle.attendancePending)}
        emptyLabel="Sin asistencia pendiente"
        unavailableLabel="Fuente no disponible"
        href={bundle.attendancePending.href}
        onOpen={() => openHref(router, bundle.attendancePending.href)}
      />

      <MessagesPendingCard
        unsent={bundle.messagesPending.unsent}
        failed={bundle.messagesPending.failed}
        unread={bundle.messagesPending.unread}
        sourceAvailable={bundle.messagesPending.sourceAvailable}
        href={bundle.messagesPending.href}
        onOpen={() => openHref(router, bundle.messagesPending.href)}
      />

      <ChargesOverdueCard
        overdue={bundle.chargesOverdue.overdue}
        failed={bundle.chargesOverdue.failed}
        sourceAvailable={bundle.chargesOverdue.sourceAvailable}
        href={bundle.chargesOverdue.href}
        onOpen={() => openHref(router, bundle.chargesOverdue.href)}
      />

      <BlockTile
        title="Borradores de progreso"
        display={renderCount(bundle.progressDrafts)}
        emptyLabel="Sin borradores"
        unavailableLabel="Fuente no disponible"
        href={bundle.progressDrafts.href}
        onOpen={() => openHref(router, bundle.progressDrafts.href)}
      />
    </>
  );
}

// El bundle compartido devuelve `href` como ruta relativa a la versión
// web (p.ej. `/app/abc/billing/overdue`). En Fase 2 Mobile abre esos
// enlaces en el navegador companion via Linking.openURL; en Fase 3 se
// introducirá una tabla de mapeo href → ruta interna Expo Router para
// las acciones que ya tienen pantalla nativa (asistencia, mensajes).
function openHref(router: ReturnType<typeof useRouter>, href: string | null): void {
  if (!href) return;
  // Convención actual del contrato: href es SIEMPRE una ruta web.
  // Si en el futuro algún bloque expone rutas internas, distinguirlas
  // aquí (p.ej. prefijo `/app/` → web, prefijo `/mobile/` → router).
  void Linking.openURL(href).catch(() => {
    // Si el dispositivo no puede abrir el link (sin browser), navegar a
    // la pestaña de avisos como fallback informativo. Nunca throw a UI.
    router.push('/(tabs)/notifications');
  });
}

function PriorityActionBanner({
  label,
  onOpen,
}: {
  label: string;
  onOpen: () => void;
}) {
  return (
    <Card style={styles.priorityBanner}>
      <Text style={styles.priorityLabel}>{label}</Text>
      <Button title="Resolver" variant="primary" fullWidth onPress={onOpen} />
    </Card>
  );
}

function ImportActiveCard({
  state,
  filename,
  onOpen,
}: {
  state: string;
  filename: string | null;
  onOpen: () => void;
}) {
  return (
    <Card title="Importación en curso">
      <Text style={styles.importState}>{state}</Text>
      {filename ? <Text style={styles.importFilename}>{filename}</Text> : null}
      <Button title="Ver detalle" variant="secondary" fullWidth onPress={onOpen} />
    </Card>
  );
}

function TodaySessionsCard({ today }: { today: TodaySession[] }) {
  return (
    <Card title="Hoy" subtitle="Sesiones programadas">
      {today.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="Sin sesiones hoy"
          description="Cuando haya clases programadas aparecerán aquí."
          tone="light"
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {today.slice(0, 5).map((s) => (
            <View key={s.sessionId} style={styles.sessionRow}>
              <Text style={styles.sessionClass}>{s.className ?? 'Clase'}</Text>
              <Text style={styles.sessionTime}>{formatTime(s.startsAt)}</Text>
              <Text style={styles.sessionStatus}>
                {s.attendanceRecorded ? 'Asistencia tomada' : 'Sin marcar'}
              </Text>
            </View>
          ))}
=======
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
        <EmptyState icon="alert-circle-outline" title="No se pudieron cargar los KPIs" tone="light" />
      ) : (
        <View style={styles.kpiGrid}>
          <KpiTile label="Atletas" value={kpis?.athletes ?? 0} />
          <KpiTile label="Entrenadores" value={kpis?.coaches ?? 0} />
          <KpiTile label="Grupos" value={kpis?.groups ?? 0} />
          <KpiTile label="Clases esta semana" value={kpis?.classesThisWeek ?? 0} />
          <KpiTile label="Evaluaciones" value={kpis?.assessments ?? 0} />
          <KpiTile label="Asistencia (7 días)" value={`${kpis?.attendancePercent ?? 0}%`} />
>>>>>>> origin/main
        </View>
      )}
    </Card>
  );
}

<<<<<<< HEAD
function BlockTile({
  title,
  display,
  emptyLabel,
  unavailableLabel,
  href,
  onOpen,
}: {
  title: string;
  display: ReturnType<typeof renderCount>;
  emptyLabel: string;
  unavailableLabel: string;
  href: string | null;
  onOpen: () => void;
}) {
  const value =
    display.kind === 'value'
      ? String(display.value)
      : display.kind === 'empty'
        ? emptyLabel
        : unavailableLabel;
  return (
    <Card title={title}>
      <Text style={styles.tileValue}>{value}</Text>
      {href ? (
        <Button title="Ver detalle" variant="secondary" fullWidth onPress={onOpen} />
      ) : null}
    </Card>
  );
}

function MessagesPendingCard({
  unsent,
  failed,
  unread,
  sourceAvailable,
  href,
  onOpen,
}: {
  unsent: number;
  failed: number;
  unread: number;
  sourceAvailable: boolean;
  href: string | null;
  onOpen: () => void;
}) {
  return (
    <Card title="Mensajes pendientes">
      {!sourceAvailable ? (
        <Text style={styles.tileMuted}>Fuente no disponible</Text>
      ) : (
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.lineItem}>Sin enviar: {unsent}</Text>
          <Text style={styles.lineItem}>Fallidos: {failed}</Text>
          <Text style={styles.lineItem}>No leídos: {unread}</Text>
        </View>
      )}
      {href ? (
        <Button title="Ver mensajes" variant="secondary" fullWidth onPress={onOpen} />
      ) : null}
    </Card>
  );
}

function ChargesOverdueCard({
  overdue,
  failed,
  sourceAvailable,
  href,
  onOpen,
}: {
  overdue: number;
  failed: number;
  sourceAvailable: boolean;
  href: string | null;
  onOpen: () => void;
}) {
  return (
    <Card title="Cargos vencidos o fallidos">
      {!sourceAvailable ? (
        <Text style={styles.tileMuted}>Fuente no disponible</Text>
      ) : overdue + failed === 0 ? (
        <Text style={styles.tileMuted}>Sin cargos vencidos</Text>
      ) : (
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.lineItem}>Vencidos: {overdue}</Text>
          <Text style={styles.lineItem}>Fallidos: {failed}</Text>
        </View>
      )}
      {href ? (
        <Button title="Ver cargos" variant="secondary" fullWidth onPress={onOpen} />
      ) : null}
    </Card>
  );
}

function formatTime(iso: string): string {
  // El bundle devuelve startsAt en ISO. Para Fase 2, mostrar HH:mm local.
  // Si el parseo falla, mostrar la cadena cruda.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

=======
function KpiTile({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.kpiTile}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

>>>>>>> origin/main
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
<<<<<<< HEAD
  priorityBanner: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  priorityLabel: {
    ...typography.body,
    color: '#92400E',
    fontWeight: '600',
  },
  importState: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  importFilename: {
    ...typography.caption,
    color: colors.textMuted,
  },
  tileValue: {
    ...typography.title,
    color: colors.text,
    fontWeight: '700',
  },
  tileMuted: {
    ...typography.body,
    color: colors.textMuted,
  },
  lineItem: {
    ...typography.body,
    color: colors.text,
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  sessionClass: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  sessionTime: {
    ...typography.caption,
    color: colors.textMuted,
    marginRight: spacing.sm,
  },
  sessionStatus: {
    ...typography.caption,
    color: colors.textMuted,
  },
  scheduleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    minHeight: 44, // touch target mínimo (a11y, Fase 9)
  },
  scheduleClass: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  scheduleWhen: {
    ...typography.caption,
    color: colors.textMuted,
  },
  summaryLine: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
=======
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  kpiTile: { width: '30%', gap: 2 },
  kpiValue: { ...typography.title, color: colors.text, fontWeight: '700' },
  kpiLabel: { ...typography.caption, color: colors.textMuted },
>>>>>>> origin/main
});
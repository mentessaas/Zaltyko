// Inicio de familia. Esta ruta es explícita para deep links y para el
// contrato AC-08; el home de tabs puede seguir adaptándose por rol, pero
// aquí nunca se carga información familiar para un rol de staff.

import { Redirect, Stack, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChildCard } from '@/components/family/ChildCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { RefreshableScrollView } from '@/components/ui/RefreshableScrollView';
import { SkeletonGroup } from '@/components/ui/Skeleton';
import { ApiClientError } from '@/lib/api/client';
import {
  getFamilyChildren,
  type FamilyChild,
} from '@/lib/api/endpoints';
import {
  getMyDashboard,
  renderFamilyCount,
  type FamilyDashboardBundle,
  type ScheduleItem,
} from '@/lib/api/family-dashboard';
import { useSession } from '@/lib/auth/use-session';
import { colors, spacing, typography } from '@/lib/theme';

export default function FamilyDashboardScreen() {
  const { status, profile } = useSession();
  const router = useRouter();
  const isFamilyRole = profile?.role === 'parent' || profile?.role === 'athlete';

  const dashboardQuery = useQuery<FamilyDashboardBundle>({
    queryKey: ['family', 'my-dashboard', profile?.id, profile?.academyId],
    // El rol viene de /api/me y el tenant del Bearer; no se acepta ningún
    // academyId desde params o desde la navegación.
    queryFn: () => getMyDashboard(profile?.role),
    enabled: status === 'authenticated' && profile !== null,
    staleTime: 60 * 1000,
  });

  const childrenQuery = useQuery<FamilyChild[]>({
    queryKey: ['family', 'children', profile?.id, profile?.academyId],
    queryFn: getFamilyChildren,
    // Defensa adicional: un deep link de admin/coach/owner no dispara ni
    // siquiera la consulta de hijos. El dashboard también falla cerrado.
    enabled: status === 'authenticated' && isFamilyRole,
    staleTime: 60 * 1000,
  });

  if (status === 'loading') {
    return (
      <View style={styles.loading} accessibilityLabel="Cargando tu espacio familiar">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (status === 'unauthenticated') {
    return <Redirect href="/(auth)/login" />;
  }

  if (!profile) {
    return (
      <View style={styles.loading}>
        <EmptyState
          icon="cloud-offline-outline"
          title="No se pudo cargar tu perfil"
          description="Revisa tu conexión e inténtalo de nuevo."
        />
      </View>
    );
  }

  const refresh = async () => {
    const requests: Promise<unknown>[] = [dashboardQuery.refetch()];
    if (isFamilyRole) requests.push(childrenQuery.refetch());
    await Promise.all(requests);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Mi espacio', headerBackTitle: 'Atrás' }} />
      <RefreshableScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        onRefresh={refresh}
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>MI ESPACIO</Text>
          <Text style={styles.title}>Hola, {profile.fullName ?? 'familia'}</Text>
          <Text style={styles.subtitle}>
            Todo lo importante de tus hijos, en un solo lugar.
          </Text>
          {profile.academyName ? (
            <Text style={styles.academy}>{profile.academyName}</Text>
          ) : null}
        </View>

        {dashboardQuery.error ? (
          <RoleErrorState error={dashboardQuery.error} onRetry={() => dashboardQuery.refetch()} />
        ) : (
          <>
            <ChildrenCard
              data={childrenQuery.data}
              isLoading={childrenQuery.isLoading}
              hasError={Boolean(childrenQuery.error)}
              onRetry={() => childrenQuery.refetch()}
              onChildPress={(child) => router.push(`/family/child/${child.id}`)}
            />
            <NextClassesCard
              block={dashboardQuery.data?.nextClasses}
              loading={dashboardQuery.isLoading}
              onOpen={() => router.push('/(tabs)/schedule')}
            />
            <UnreadCard
              block={dashboardQuery.data?.unread}
              loading={dashboardQuery.isLoading}
              onMessages={() => router.push('/(tabs)/messages')}
              onNotifications={() => router.push('/(tabs)/notifications')}
            />
            <PendingChargesCard
              block={dashboardQuery.data?.pendingCharges}
              loading={dashboardQuery.isLoading}
              onOpen={() => router.push('/family/invoices')}
            />
          </>
        )}
      </RefreshableScrollView>
    </>
  );
}

function ChildrenCard({
  data,
  isLoading,
  hasError,
  onRetry,
  onChildPress,
}: {
  data: FamilyChild[] | undefined;
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
  onChildPress: (child: FamilyChild) => void;
}) {
  return (
    <Card title="Tus hijos" subtitle="Resumen de atletas vinculados">
      {isLoading ? (
        <SkeletonGroup count={2} />
      ) : hasError ? (
        <EmptyState
          icon="alert-circle-outline"
          title="No se pudieron cargar"
          description="El resumen de tus hijos no está disponible ahora."
          tone="light"
          action={<Button title="Reintentar" variant="secondary" onPress={onRetry} />}
        />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="Sin hijos vinculados"
          description="La academia podrá vincularlos a tu cuenta cuando estén listos."
          tone="light"
        />
      ) : (
        <View style={styles.stack}>
          {data.map((child) => (
            <ChildCard key={child.id} child={child} onPress={() => onChildPress(child)} />
          ))}
        </View>
      )}
    </Card>
  );
}

function NextClassesCard({
  block,
  loading,
  onOpen,
}: {
  block: FamilyDashboardBundle['nextClasses'] | undefined;
  loading: boolean;
  onOpen: () => void;
}) {
  if (loading) {
    return <Card title="Próximas clases"><SkeletonGroup count={2} /></Card>;
  }
  if (!block) return null;

  return (
    <Card title="Próximas clases" subtitle="La agenda de tus hijos">
      {!block.sourceAvailable ? (
        <Unavailable />
      ) : block.items.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="Sin clases próximas"
          description="Cuando haya una clase programada aparecerá aquí."
          tone="light"
        />
      ) : (
        <View style={styles.stack}>
          {block.items.map((item) => <ScheduleRow key={item.id} item={item} onPress={onOpen} />)}
        </View>
      )}
      <Button title="Ver agenda completa" variant="secondary" fullWidth onPress={onOpen} />
    </Card>
  );
}

function ScheduleRow({ item, onPress }: { item: ScheduleItem; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.className}, ${item.day} ${item.time}`}
      style={({ pressed }) => [styles.scheduleRow, pressed && styles.pressed]}
    >
      <View style={styles.scheduleCopy}>
        <Text style={styles.scheduleClass}>{item.className}</Text>
        <Text style={styles.scheduleWhen}>{item.day} · {item.time}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function UnreadCard({
  block,
  loading,
  onMessages,
  onNotifications,
}: {
  block: FamilyDashboardBundle['unread'] | undefined;
  loading: boolean;
  onMessages: () => void;
  onNotifications: () => void;
}) {
  if (loading) {
    return <Card title="Avisos y mensajes"><SkeletonGroup count={2} /></Card>;
  }
  if (!block) return null;
  const display = renderFamilyCount({
    count: block.notifications + block.conversations,
    sourceAvailable: block.sourceAvailable,
  });

  return (
    <Card title="Avisos y mensajes" subtitle="Mantente al día con tu academia">
      {!block.sourceAvailable ? (
        <Unavailable />
      ) : display.kind === 'empty' ? (
        <EmptyState
          icon="checkmark-circle-outline"
          title="Todo al día"
          description="No tienes avisos ni mensajes sin leer."
          tone="light"
        />
      ) : (
        <View style={styles.stack}>
          <Text style={styles.metric}>{display.kind === 'value' ? display.value : '—'}</Text>
          <Text style={styles.metricLabel}>pendientes de leer</Text>
          <Text style={styles.detail}>Notificaciones: {block.notifications}</Text>
          <Text style={styles.detail}>Conversaciones: {block.conversations}</Text>
        </View>
      )}
      <View style={styles.actions}>
        <Button title="Mensajes" variant="secondary" onPress={onMessages} />
        <Button title="Avisos" variant="ghost" onPress={onNotifications} />
      </View>
    </Card>
  );
}

function PendingChargesCard({
  block,
  loading,
  onOpen,
}: {
  block: FamilyDashboardBundle['pendingCharges'] | undefined;
  loading: boolean;
  onOpen: () => void;
}) {
  if (loading) {
    return <Card title="Pagos pendientes"><SkeletonGroup count={2} /></Card>;
  }
  if (!block) return null;

  return (
    <Card title="Pagos pendientes" subtitle="Cuotas de tus hijos">
      {!block.sourceAvailable ? (
        <Unavailable />
      ) : block.items.length === 0 ? (
        <EmptyState
          icon="checkmark-circle-outline"
          title="Estás al día"
          description="No hay pagos pendientes en este momento."
          tone="light"
        />
      ) : (
        <View style={styles.stack}>
          <Text style={styles.metric}>{block.items.length}</Text>
          <Text style={styles.metricLabel}>
            {block.items.length === 1 ? 'cuota por pagar' : 'cuotas por pagar'}
          </Text>
        </View>
      )}
      <Button title="Ver cuotas y pagos" variant="secondary" fullWidth onPress={onOpen} />
    </Card>
  );
}

function Unavailable() {
  return (
    <View style={styles.unavailable} accessibilityRole="text">
      <Text style={styles.unavailableTitle}>Fuente no disponible</Text>
      <Text style={styles.unavailableBody}>Inténtalo de nuevo más tarde.</Text>
    </View>
  );
}

function RoleErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const isForbidden = error instanceof ApiClientError && error.code === 'FORBIDDEN_ROLE';
  return (
    <Card title="Mi espacio familiar">
      <EmptyState
        icon={isForbidden ? 'lock-closed-outline' : 'alert-circle-outline'}
        title={isForbidden ? 'Este espacio no está disponible para tu rol' : 'No se pudo cargar el espacio'}
        description={
          isForbidden
            ? 'Si necesitas acceso, contacta con el equipo de tu academia.'
            : 'Revisa tu conexión e inténtalo de nuevo.'
        }
        tone="light"
        action={
          isForbidden ? undefined : (
            <Button title="Reintentar" variant="secondary" onPress={onRetry} />
          )
        }
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  hero: { gap: spacing.xs, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  eyebrow: { ...typography.label, color: colors.onDarkAccent, letterSpacing: 1.4 },
  title: { ...typography.display, color: colors.textInverse },
  subtitle: { ...typography.body, color: colors.onDarkSubtle },
  academy: { ...typography.caption, color: colors.onDarkMuted, marginTop: spacing.xs },
  stack: { gap: spacing.sm },
  scheduleRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.surfaceMuted, // border primario aparece en pressed
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
    borderColor: colors.primary, // 6.29:1 sobre surface — WCAG 1.4.11 PASS
  },
  scheduleCopy: { flex: 1, gap: 2 },
  scheduleClass: { ...typography.body, color: colors.text, fontWeight: '600' },
  scheduleWhen: { ...typography.caption, color: colors.textMuted },
  chevron: { fontSize: 28, lineHeight: 28, color: colors.textMuted },
  metric: { ...typography.display, color: colors.primary },
  metricLabel: { ...typography.caption, color: colors.textMuted },
  detail: { ...typography.caption, color: colors.textMuted },
  unavailable: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  unavailableTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
  unavailableBody: { ...typography.caption, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
});

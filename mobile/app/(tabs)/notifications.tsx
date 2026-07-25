// Bandeja de avisos. Semana 7:
//   - Carga inicial desde /api/notifications.
//   - Suscripción Realtime a la tabla `notifications` filtrada por
//     `user_id = profile.id` para avisos en vivo (foreground).
//   - Pull-to-refresh y botón "Marcar todo como leído".

import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonGroup } from '@/components/ui/Skeleton';
import { NotificationRow } from '@/components/notifications/Item';
import { useSession } from '@/lib/auth/use-session';
import {
  getNotifications,
  markAllNotificationsRead,
  type NotificationItem,
} from '@/lib/api/endpoints';
import { subscribeToUserNotifications } from '@/lib/realtime/subscribe';
import { colors, spacing, typography } from '@/lib/theme';

export default function NotificationsScreen() {
  const { profile } = useSession();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const listQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotifications({ limit: 50 }),
    staleTime: 30 * 1000,
    enabled: !!profile,
  });

  // Realtime: solo cuando hay profile. Cleanup al desmontar o cambiar.
  useEffect(() => {
    if (!profile) return;
    const unsubscribe = subscribeToUserNotifications(profile.id, (n) => {
      queryClient.setQueryData<NotificationItem[]>(['notifications'], (prev) => {
        const items = prev ?? [];
        if (items.some((it) => it.id === n.id)) return items;
        return [n, ...items];
      });
    });
    return unsubscribe;
  }, [profile, queryClient]);

  const markAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.setQueryData<NotificationItem[]>(['notifications'], (prev) =>
        (prev ?? []).map((it) => ({ ...it, read: true, readAt: new Date().toISOString() }))
      );
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await listQuery.refetch();
    setRefreshing(false);
  }, [listQuery]);

  const items = listQuery.data ?? [];
  const unreadCount = items.filter((i) => !i.read).length;

  return (
    <FlatList
      style={styles.flex}
      contentContainerStyle={styles.content}
      data={listQuery.isLoading ? [] : items}
      keyExtractor={(item) => item.id}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
      ListHeaderComponent={
        <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Avisos</Text>
            {unreadCount > 0 ? (
              <Text style={styles.badge}>{unreadCount} sin leer</Text>
            ) : null}
          </View>
          {unreadCount > 0 ? (
            <Button
              title="Marcar todo como leído"
              variant="secondary"
              fullWidth
              onPress={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
            />
          ) : null}
        </View>
      }
      ListEmptyComponent={
        listQuery.isLoading ? (
          <SkeletonGroup count={4} />
        ) : listQuery.error ? (
          <Card>
            <EmptyState
              icon="alert-circle-outline"
              title="No se pudieron cargar los avisos"
            />
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon="notifications-off-outline"
              title="Sin avisos por ahora"
              description="Cuando la academia envíe un comunicado aparecerá aquí al instante."
            />
          </Card>
        )
      }
      renderItem={({ item }) => <NotificationRow item={item} />}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...typography.display, color: colors.textInverse },
  badge: {
    ...typography.caption,
    color: colors.primaryFg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
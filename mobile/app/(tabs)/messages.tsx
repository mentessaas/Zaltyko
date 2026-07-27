// Bandeja de mensajería interna. Las conversaciones nuevas solo las
// abre el staff/la academia (ver web); el móvil lista, lee y responde
// en conversaciones existentes — no hay selector de destinatario.

import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonGroup } from '@/components/ui/Skeleton';
import { ConversationRow } from '@/components/messages/ConversationRow';
import { getConversations } from '@/lib/api/endpoints';
import { colors, spacing, typography } from '@/lib/theme';

export default function MessagesScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const listQuery = useQuery({
    queryKey: ['messages', 'conversations'],
    queryFn: getConversations,
    staleTime: 30 * 1000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await listQuery.refetch();
    setRefreshing(false);
  }, [listQuery]);

  const items = listQuery.data ?? [];

  return (
    <FlatList
      style={styles.flex}
      contentContainerStyle={styles.content}
      data={listQuery.isLoading ? [] : items}
      keyExtractor={(item) => item.id}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      ListHeaderComponent={
        <Text style={styles.title}>Mensajes</Text>
      }
      ListEmptyComponent={
        listQuery.isLoading ? (
          <SkeletonGroup count={4} />
        ) : listQuery.error ? (
          <Card>
            <EmptyState icon="alert-circle-outline" title="No se pudieron cargar los mensajes" />
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon="chatbubbles-outline"
              title="Sin conversaciones todavía"
              description="Cuando la academia inicie una conversación contigo aparecerá aquí."
            />
          </Card>
        )
      }
      renderItem={({ item }) => (
        <ConversationRow item={item} onPress={() => router.push(`/messages/${item.id}`)} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.sm },
  title: { ...typography.display, color: colors.textInverse, marginBottom: spacing.md },
});

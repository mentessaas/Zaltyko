// Hilo de una conversación. Carga la primera página (más antigua a
// más reciente, tal como la devuelve la API) y permite responder.
// No hay selector de destinatario: solo se puede responder en
// conversaciones que ya existen (ver comentario en (tabs)/messages.tsx).

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonGroup } from '@/components/ui/Skeleton';
import { MessageBubble } from '@/components/messages/MessageBubble';
import { useSession } from '@/lib/auth/use-session';
import {
  getConversationMessages,
  sendConversationMessage,
  type Conversation,
  type ConversationMessage,
} from '@/lib/api/endpoints';
import { colors, radii, spacing } from '@/lib/theme';

export default function ConversationThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useSession();
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList<ConversationMessage>>(null);
  const [draft, setDraft] = useState('');

  const title = useMemo(() => {
    const conversations = queryClient.getQueryData<Conversation[]>(['messages', 'conversations']);
    const conv = conversations?.find((c) => c.id === id);
    const names = conv?.otherParticipants
      .map((p) => p.profile?.fullName)
      .filter((n): n is string => !!n);
    return names && names.length > 0 ? names.join(', ') : 'Conversación';
  }, [queryClient, id]);

  const messagesQuery = useQuery({
    queryKey: ['messages', 'thread', id],
    queryFn: () => getConversationMessages(id ?? ''),
    enabled: !!id,
    staleTime: 15 * 1000,
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) => sendConversationMessage(id ?? '', content),
    onSuccess: () => {
      setDraft('');
      messagesQuery.refetch().then(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    },
  });

  const onSend = useCallback(() => {
    const content = draft.trim();
    if (!content || sendMutation.isPending) return;
    sendMutation.mutate(content);
  }, [draft, sendMutation]);

  const items = messagesQuery.data?.items ?? [];

  return (
    <>
      <Stack.Screen options={{ title, headerBackTitle: 'Atrás' }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={listRef}
          style={styles.flex}
          contentContainerStyle={styles.content}
          data={items}
          keyExtractor={(item) => item.id}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          ListEmptyComponent={
            messagesQuery.isLoading ? (
              <SkeletonGroup count={4} />
            ) : messagesQuery.error ? (
              <EmptyState icon="alert-circle-outline" title="No se pudo cargar la conversación" />
            ) : (
              <EmptyState icon="chatbubble-outline" title="Sin mensajes todavía" />
            )
          }
          renderItem={({ item }) => (
            <MessageBubble item={item} isOwn={item.senderId === profile?.id} />
          )}
        />

        <View style={styles.inputRow}>
          <View style={styles.inputWrap}>
            <Input
              value={draft}
              onChangeText={setDraft}
              placeholder="Escribe un mensaje…"
              multiline
            />
          </View>
          <Pressable
            onPress={onSend}
            disabled={!draft.trim() || sendMutation.isPending}
            style={[styles.sendBtn, (!draft.trim() || sendMutation.isPending) && styles.sendBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Enviar mensaje"
          >
            <Ionicons name="send" size={18} color={colors.primaryFg} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.md, flexGrow: 1, justifyContent: 'flex-end' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderDark,
  },
  inputWrap: { flex: 1, maxHeight: 120 },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
});

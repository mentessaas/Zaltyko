// Fila de conversación: nombre del/los otro(s) participante(s),
// último mensaje y contador de no leídos. Memoizada para listas largas.

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/lib/theme';
import type { Conversation } from '@/lib/api/endpoints';

interface Props {
  item: Conversation;
  onPress: () => void;
}

function participantsLabel(item: Conversation): string {
  const names = item.otherParticipants
    .map((p) => p.profile?.fullName)
    .filter((n): n is string => !!n);
  if (names.length === 0) return item.title ?? 'Conversación';
  if (names.length <= 2) return names.join(', ');
  return `${names[0]} y ${names.length - 1} más`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return 'ahora';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d`;
  return new Date(iso).toLocaleDateString();
}

function ConversationRowImpl({ item, onPress }: Props) {
  const label = participantsLabel(item);
  const initial = label.trim().charAt(0).toUpperCase() || '?';
  const unread = item.unreadCount > 0;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, unread && styles.rowUnread]}
      accessibilityRole="button"
      accessibilityLabel={`Conversación con ${label}${unread ? `. ${item.unreadCount} ${item.unreadCount === 1 ? 'mensaje no leído' : 'mensajes no leídos'}` : ''}`}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={styles.name} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.time}>{timeAgo(item.lastMessageAt)}</Text>
        </View>
        <Text style={styles.preview} numberOfLines={1}>
          {item.lastMessagePreview ?? 'Sin mensajes todavía'}
        </Text>
      </View>
      {unread ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.unreadCount > 9 ? '9+' : item.unreadCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export const ConversationRow = memo(ConversationRowImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowUnread: { borderColor: colors.primary, borderWidth: 1.5 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.label, color: colors.primaryFg, fontWeight: '700' },
  body: { flex: 1, gap: 2 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  name: { ...typography.body, color: colors.text, fontWeight: '600', flex: 1 },
  time: { ...typography.caption, color: colors.textMuted },
  preview: { ...typography.caption, color: colors.textMuted },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { ...typography.caption, color: colors.primaryFg, fontWeight: '700', fontSize: 11 },
});

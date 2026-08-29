// Ítem de aviso. memoizado porque la bandeja puede tener 50+ entradas
// y solo cambia una fila cuando llega push realtime.

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing, typography } from '@/lib/theme';
import type { NotificationItem } from '@/lib/api/endpoints';

interface Props {
  item: NotificationItem;
  onPress?: () => void;
}

function iconForType(type: string): keyof typeof Ionicons.glyphMap {
  if (type.includes('payment') || type.includes('invoice')) return 'card-outline';
  if (type.includes('event')) return 'calendar-outline';
  if (type.includes('class') || type.includes('session')) return 'fitness-outline';
  if (type.includes('message') || type.includes('chat')) return 'chatbubble-outline';
  return 'notifications-outline';
}

function timeAgo(iso: string): string {
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

function ItemImpl({ item, onPress }: Props) {
  const unread = !item.read;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, unread && styles.rowUnread, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.message}${unread ? '. No leído' : ''}`}
    >
      <View style={styles.iconBox}>
        <Ionicons name={iconForType(item.type)} size={18} color={colors.primary} />
      </View>
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
        </View>
        <Text style={styles.message} numberOfLines={2}>
          {item.message}
        </Text>
      </View>
      {unread ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

export const NotificationRow = memo(ItemImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  rowUnread: { borderColor: colors.primary, borderWidth: 1.5 },
  rowPressed: {
    backgroundColor: colors.surfacePressed,
    borderColor: colors.primary, // 6.29:1 sobre surface — WCAG 1.4.11 PASS
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  title: { ...typography.label, color: colors.text, fontWeight: '700', flex: 1 },
  time: { ...typography.caption, color: colors.textMuted },
  message: { ...typography.caption, color: colors.textMuted, lineHeight: 18 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
});
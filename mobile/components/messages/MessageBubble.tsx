// Burbuja de mensaje individual. Alineada a la derecha (propia, en
// color primario) o a la izquierda (ajena, superficie neutra).

import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/lib/theme';
import type { ConversationMessage } from '@/lib/api/endpoints';

interface Props {
  item: ConversationMessage;
  isOwn: boolean;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function MessageBubbleImpl({ item, isOwn }: Props) {
  return (
    <View style={[styles.wrap, isOwn ? styles.wrapOwn : styles.wrapOther]}>
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        <Text style={[styles.text, isOwn ? styles.textOwn : styles.textOther]}>
          {item.content}
        </Text>
      </View>
      <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
    </View>
  );
}

export const MessageBubble = memo(MessageBubbleImpl);

const styles = StyleSheet.create({
  wrap: { maxWidth: '80%', gap: 2 },
  wrapOwn: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  wrapOther: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: {
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleOwn: { backgroundColor: colors.primary, borderBottomRightRadius: radii.sm },
  bubbleOther: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: radii.sm,
  },
  text: { ...typography.body },
  textOwn: { color: colors.primaryFg },
  textOther: { color: colors.text },
  time: { ...typography.caption, color: '#94A3B8', fontSize: 11 },
});

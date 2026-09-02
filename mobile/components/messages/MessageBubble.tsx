// Burbuja de mensaje individual. Alineada a la derecha (propia, en
// color primario) o a la izquierda (ajena, superficie neutra).
//
// Estado de entrega (ZAL-622 AC-04): sólo visible para mensajes propios.
// Mientras el cliente HTTP está enviando la mutación, marcamos `pending`;
// al confirmarse el POST, `sent`. Si el POST falla, `failed` + CTA
// "Reintentar" para que el usuario pueda repetir la operación sin
// reescribir el mensaje. El backend aún no expone `read` por destinatario,
// así que `read` queda como estado futuro: hoy un mensaje confirmado se
// renderiza como `sent`.

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing, typography } from '@/lib/theme';
import type { ConversationMessage } from '@/lib/api/endpoints';

export type DeliveryStatus = 'pending' | 'sent' | 'failed';

interface Props {
  item: ConversationMessage;
  isOwn: boolean;
  /**
   * Estado de entrega. Para mensajes ajenos se ignora. Para mensajes
   * propios confirmados por el backend, omitir (asume `sent`). Para
   * mensajes optimistas todavía no confirmados, `pending`. Si el POST
   * falló, `failed` (y entonces se renderiza el CTA "Reintentar").
   */
  deliveryStatus?: DeliveryStatus;
  /** Reintentar el envío del mensaje. Obligatorio si `deliveryStatus === 'failed'`. */
  onRetry?: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

interface StatusMeta {
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
}

const STATUS_META: Record<DeliveryStatus, StatusMeta> = {
  pending: {
    iconName: 'time-outline',
    label: 'Enviando…',
    color: colors.onDarkMuted,
  },
  sent: {
    iconName: 'checkmark',
    label: 'Enviado',
    color: colors.onDarkMuted,
  },
  failed: {
    iconName: 'alert-circle',
    label: 'No enviado',
    color: colors.danger,
  },
};

function DeliveryIndicator({
  status,
  onRetry,
}: {
  status: DeliveryStatus;
  onRetry?: () => void;
}) {
  const meta = STATUS_META[status];
  const accessible = status === 'failed' && !!onRetry;

  const labelText = accessible ? 'No enviado. Toca para reintentar.' : meta.label;

  if (accessible) {
    return (
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={labelText}
        hitSlop={14}
        style={styles.statusRow}
      >
        <Ionicons name={meta.iconName} size={12} color={meta.color} />
        <Text style={[styles.statusLabel, { color: meta.color }]}>{meta.label}</Text>
      </Pressable>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={labelText}
      style={styles.statusRow}
    >
      <Ionicons name={meta.iconName} size={12} color={meta.color} />
      {status === 'pending' ? (
        <Text style={[styles.statusLabel, { color: meta.color }]}>{meta.label}</Text>
      ) : null}
    </View>
  );
}

function MessageBubbleImpl({ item, isOwn, deliveryStatus, onRetry }: Props) {
  // Estado efectivo: mensajes ajenos SIEMPRE se ven confirmados (el
  // destinatario no tiene que conocer el estado interno del emisor).
  const effectiveStatus: DeliveryStatus = isOwn ? (deliveryStatus ?? 'sent') : 'sent';
  return (
    <View style={[styles.wrap, isOwn ? styles.wrapOwn : styles.wrapOther]}>
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        <Text style={[styles.text, isOwn ? styles.textOwn : styles.textOther]}>
          {item.content}
        </Text>
      </View>
      <View style={[styles.metaRow, isOwn ? styles.metaRowOwn : styles.metaRowOther]}>
        <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
        {isOwn ? (
          <DeliveryIndicator status={effectiveStatus} onRetry={onRetry} />
        ) : null}
      </View>
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaRowOwn: { alignSelf: 'flex-end' },
  metaRowOther: { alignSelf: 'flex-start' },
  time: { ...typography.caption, color: colors.onDarkMuted, fontSize: 11 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statusLabel: { ...typography.caption, fontSize: 11 },
});

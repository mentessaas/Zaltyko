// Tarjeta de cuota con CTA "Pagar en web". El pago se hace siempre
// en la web (Apple Guideline 3.1.3(f) para apps companion B2B —
// no usar IAP).

import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { Button } from '@/components/ui/Button';
import { webBaseUrl, ApiClientError } from '@/lib/api/client';
<<<<<<< HEAD
import {
  getChargePayUrl,
  type Charge,
  CHARGE_STATUS_LABEL,
  isChargePayable,
  type ChargeStatus,
} from '@/lib/api/endpoints';
=======
import { getChargePayUrl, type Charge } from '@/lib/api/endpoints';
>>>>>>> origin/main
import { colors, radii, spacing, typography } from '@/lib/theme';

interface Props {
  charge: Charge;
}

function formatAmount(cents: number, currency: string): string {
  const amount = cents / 100;
  // Euro por defecto (mercado principal Zaltyko MVP).
  const symbol = currency === 'EUR' ? '€' : currency;
  return `${amount.toFixed(2)} ${symbol}`;
}

<<<<<<< HEAD
function statusColor(status: ChargeStatus): string {
=======
function statusColor(status: Charge['status']) {
>>>>>>> origin/main
  switch (status) {
    case 'paid':
      return colors.success;
    case 'overdue':
<<<<<<< HEAD
    case 'failed':
      return colors.danger;
    case 'due':
    case 'partial':
      return colors.warning;
    case 'draft':
      return colors.info;
    case 'cancelled':
    case 'refunded':
      return colors.textMuted;
=======
      return colors.danger;
    case 'pending':
      return colors.warning;
    case 'cancelled':
    case 'refunded':
      return colors.textMuted;
    default:
      return colors.textMuted;
>>>>>>> origin/main
  }
}

function InvoiceCardImpl({ charge }: Props) {
  const onPay = useCallback(async () => {
    try {
      const url = await getChargePayUrl(charge.id);
      // Si el backend devuelve URL absoluta, ábrela tal cual. Si es
      // relativa, prepende el base de la web.
      const target = url.startsWith('http') ? url : `${webBaseUrl()}${url}`;
      await WebBrowser.openBrowserAsync(target, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        console.warn('[invoices] pay URL error:', err.message);
      } else {
        console.warn('[invoices] WebBrowser open failed:', err);
      }
    }
  }, [charge.id]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{charge.label ?? 'Cuota'}</Text>
          <Text style={styles.athlete}>{charge.athleteName}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: statusColor(charge.status) + '22' }]}>
          <Text style={[styles.badgeText, { color: statusColor(charge.status) }]}>
<<<<<<< HEAD
            {CHARGE_STATUS_LABEL[charge.status]}
=======
            {charge.status}
>>>>>>> origin/main
          </Text>
        </View>
      </View>
      <Text style={styles.amount}>{formatAmount(charge.amountCents, charge.currency)}</Text>
      {charge.dueDate ? (
        <Text style={styles.meta}>Vence: {new Date(charge.dueDate).toLocaleDateString()}</Text>
      ) : null}
<<<<<<< HEAD
      {isChargePayable(charge.status) ? (
=======
      {charge.status === 'pending' || charge.status === 'overdue' ? (
>>>>>>> origin/main
        <Pressable onPress={onPay} style={({ pressed }) => pressed && styles.pressed}>
          <Button title="Pagar en web" variant="primary" fullWidth />
        </Pressable>
      ) : null}
    </View>
  );
}

export const InvoiceCard = memo(InvoiceCardImpl);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  pressed: { opacity: 0.7 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  label: { ...typography.body, color: colors.text, fontWeight: '600' },
  athlete: { ...typography.caption, color: colors.textMuted },
  amount: { ...typography.display, color: colors.text, fontSize: 22 },
  meta: { ...typography.caption, color: colors.textMuted },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.full },
  badgeText: { ...typography.caption, fontWeight: '600' },
});
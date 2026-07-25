// Lista de facturas/cuotas. El pago SIEMPRE redirige a la web vía
// WebBrowser — no usamos IAP ni Stripe in-app (Apple Guideline
// 3.1.3(f) cubre este caso como "app companion de un SaaS web").

import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonGroup } from '@/components/ui/Skeleton';
import { InvoiceCard } from '@/components/family/InvoiceCard';
import { RefreshableScrollView } from '@/components/ui/RefreshableScrollView';
import { getMyCharges } from '@/lib/api/endpoints';
import { colors, spacing, typography } from '@/lib/theme';

export default function InvoicesScreen() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['me', 'charges'],
    queryFn: getMyCharges,
    staleTime: 60 * 1000,
  });

  const charges = data ?? [];

  return (
    <>
      <Stack.Screen options={{ title: 'Facturas' }} />
      <RefreshableScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        onRefresh={() => refetch()}
      >
        <Text style={styles.title}>Cuotas y pagos</Text>
        <Text style={styles.subtitle}>
          Pagos pendientes de los atletas vinculados a tu cuenta
        </Text>

        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          {isLoading ? (
            <SkeletonGroup count={3} />
          ) : error ? (
            <EmptyState
              icon="alert-circle-outline"
              title="No se pudieron cargar las cuotas"
              action={
                <Text onPress={() => refetch()} style={styles.retry}>
                  Reintentar
                </Text>
              }
            />
          ) : charges.length === 0 ? (
            <EmptyState
              icon="checkmark-circle-outline"
              title="Estás al día"
              description="No tienes cuotas pendientes."
            />
          ) : (
            charges.map((charge) => <InvoiceCard key={charge.id} charge={charge} />)
          )}
        </View>
      </RefreshableScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm },
  title: { ...typography.display, color: colors.textInverse },
  subtitle: { ...typography.body, color: '#94A3B8' },
  retry: { ...typography.label, color: colors.primary, marginTop: spacing.md },
});
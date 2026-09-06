// Perfil + atajos + cerrar sesión. Semana 7: toggle de lock biométrico
// persistido en SecureStore (default ON). Semana 8: CTA a Legal y
// privacidad para account deletion.

import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { RefreshableScrollView } from '@/components/ui/RefreshableScrollView';
import { useSession } from '@/lib/auth/use-session';
import {
  canUseBiometrics,
  isLockEnabled,
  setLockEnabled,
} from '@/lib/biometrics';
import { colors, spacing, typography } from '@/lib/theme';

export default function ProfileScreen() {
  const { profile, signOut } = useSession();
  const router = useRouter();

  const [lockEnabled, setLockEnabledState] = useState<boolean>(true);
  const [biometricsAvailable, setBiometricsAvailable] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    canUseBiometrics().then((ok) => {
      if (mounted) setBiometricsAvailable(ok);
    });
    isLockEnabled().then((enabled) => {
      if (mounted) setLockEnabledState(enabled);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!profile) return null;

  return (
    <RefreshableScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      onRefresh={async () => {
        // Perfil no tiene queries que revalidar; el pull-to-refresh
        // solo rehidrata el toggle biométrico desde SecureStore.
        const ok = await canUseBiometrics();
        const enabled = await isLockEnabled();
        if (ok) setBiometricsAvailable(true);
        setLockEnabledState(enabled);
      }}
    >
      <Card title={profile.fullName ?? profile.email} subtitle={profile.email}>
        <View style={styles.row}>
          <Text style={styles.label}>Rol</Text>
          <Text style={styles.value}>{profile.role}</Text>
        </View>
        {profile.academyName ? (
          <View style={styles.row}>
            <Text style={styles.label}>Academia</Text>
            <Text style={styles.value}>{profile.academyName}</Text>
          </View>
        ) : null}
      </Card>

      {profile.role === 'parent' && (
        <Card title="Mi cuenta">
          <Button
            title="Mis facturas"
            variant="secondary"
            fullWidth
            onPress={() => router.push('/family/invoices')}
          />
        </Card>
      )}

      {biometricsAvailable ? (
        <Card
          title="Bloqueo con biometría"
          subtitle="Pide Face ID o huella al volver tras más de 30s en segundo plano"
        >
          <View style={styles.lockRow}>
            <Text style={styles.lockLabel}>
              {lockEnabled ? 'Activado' : 'Desactivado'}
            </Text>
            <Switch
              value={lockEnabled}
              onValueChange={async (next) => {
                setLockEnabledState(next);
                await setLockEnabled(next);
              }}
              trackColor={{ false: colors.onDarkMuted, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>
        </Card>
      ) : null}

      <Card title="Sesión">
        <Button title="Cerrar sesión" variant="danger" onPress={signOut} fullWidth />
      </Card>

      <Card title="Legal y privacidad">
        <Button
          title="Política, términos y eliminar cuenta"
          variant="ghost"
          fullWidth
          onPress={() => router.push('/profile/legal')}
        />
      </Card>
    </RefreshableScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { ...typography.label, color: colors.textMuted },
  value: { ...typography.body, color: colors.text },
  lockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  lockLabel: { ...typography.body, color: colors.text },
});
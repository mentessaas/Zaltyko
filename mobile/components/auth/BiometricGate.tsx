// Gate que bloquea el contenido cuando el lock biométrico está
// armado y el usuario vuelve del background tras >30s. Renderiza un
// overlay a pantalla completa con CTA "Desbloquear". Al montar
// intenta autenticar inmediatamente para minimizar toques.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import {
  authenticate,
  canUseBiometrics,
  isLockEnabled,
  needsReauth,
  recordActiveNow,
} from '@/lib/biometrics';
import { colors, spacing, typography } from '@/lib/theme';

interface Props {
  children: React.ReactNode;
}

export function BiometricGate({ children }: Props) {
  const [locked, setLocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastState = useRef<AppStateStatus | string>(AppState.currentState);
  // Ref para evitar auto-retry durante un auth en curso (race condition).
  const inFlight = useRef(false);

  const tryUnlock = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    try {
      const ok = await authenticate('Desbloquea Zaltyko para continuar');
      if (ok) {
        await recordActiveNow();
        setLocked(false);
      } else {
        setError('No se pudo verificar tu identidad. Inténtalo de nuevo.');
      }
    } catch {
      setError('Error inesperado. Vuelve a intentarlo.');
    } finally {
      inFlight.current = false;
    }
  }, []);

  // Evaluar lock al montar + en cada cambio de AppState.
  useEffect(() => {
    let mounted = true;

    async function evaluate() {
      const enabled = await isLockEnabled();
      if (!enabled || !(await canUseBiometrics())) {
        if (mounted) {
          setLocked(false);
          setChecking(false);
        }
        return;
      }
      const needs = await needsReauth(30);
      if (mounted) {
        setLocked(needs);
        setChecking(false);
        if (needs) tryUnlock();
      } else {
        await recordActiveNow();
      }
    }

    evaluate();

    const sub = AppState.addEventListener('change', (next) => {
      // Al ir a background, anotamos "ahora" para calcular el tiempo
      // de inactividad al volver. Al volver a active, evaluamos el lock.
      if (next !== 'active' && lastState.current === 'active') {
        recordActiveNow().catch(() => undefined);
      }
      if (next === 'active' && lastState.current !== 'active') {
        evaluate();
      }
      lastState.current = next;
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, [tryUnlock]);

  if (checking) {
    return <View style={styles.flex} />;
  }

  if (!locked) {
    return <>{children}</>;
  }

  return (
    <View style={styles.overlay}>
      <Ionicons name="lock-closed" size={56} color={colors.primary} />
      <Text style={styles.title}>Zaltyko está bloqueada</Text>
      <Text style={styles.body}>
        Confirma tu identidad con Face ID o tu huella para continuar.
      </Text>
      <Button
        title="Desbloquear"
        onPress={tryUnlock}
        variant="primary"
        fullWidth
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  overlay: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
  },
  title: { ...typography.title, color: colors.textInverse, textAlign: 'center' },
  body: { ...typography.body, color: '#94A3B8', textAlign: 'center' },
  error: { ...typography.caption, color: '#FCA5A5', textAlign: 'center' },
});
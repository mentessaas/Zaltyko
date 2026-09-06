// Bienvenida de primer login: 3 pantallas cortas (qué es Zaltyko, qué
// puede hacer este rol, qué hace el bloqueo biométrico) antes de
// mostrar las tabs. Se guarda una sola vez por dispositivo.
//
// Nota: el registro de push (PushProvider) se dispara en paralelo al
// autenticarse y puede pedir el permiso de iOS/Android mientras esta
// bienvenida todavía está en pantalla — no bloqueamos ese registro para
// no tocar un flujo ya probado; es una imperfección de orden menor, no
// funcional.

import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { useSession, type ZaltykoRole } from '@/lib/auth/use-session';
import { hasSeenWelcome, markWelcomeSeen } from '@/lib/onboarding/welcome';
import { colors, spacing, typography } from '@/lib/theme';

interface Props {
  children: React.ReactNode;
}

const ROLE_COPY: Record<ZaltykoRole, { icon: keyof typeof Ionicons.glyphMap; text: string }> = {
  parent: {
    icon: 'people-outline',
    text: 'Consulta la agenda de tus hijos, su asistencia, su progreso técnico y sus cuotas — todo desde aquí.',
  },
  athlete: {
    icon: 'body-outline',
    text: 'Consulta tu agenda, tu asistencia y tu progreso técnico en cualquier momento.',
  },
  coach: {
    icon: 'clipboard-outline',
    text: 'Toma asistencia, registra progreso técnico y manda avisos a las familias, sin salir del gimnasio.',
  },
  owner: {
    icon: 'business-outline',
    text: 'Recibe avisos y mensajes de tu academia al instante. La gestión completa sigue en la web.',
  },
  admin: {
    icon: 'business-outline',
    text: 'Recibe avisos y mensajes de tu academia al instante. La gestión completa sigue en la web.',
  },
  super_admin: {
    icon: 'business-outline',
    text: 'Recibe avisos y mensajes al instante. La gestión completa sigue en la web.',
  },
  viewer: {
    icon: 'eye-outline',
    text: 'Consulta la agenda y los avisos de la academia desde aquí.',
  },
  // provider (ZAL-768): la app no es su superficie de trabajo. El copy
  // no promete productos, catálogo ni ninguna gestión — eso vive en la
  // web y lo definirá ZAL-427 si alguna vez llega a mobile.
  provider: {
    icon: 'notifications-outline',
    text: 'Recibe aquí los avisos que te manden y consulta tu perfil. Tu trabajo como proveedor se gestiona en la web.',
  },
};

export function WelcomeGate({ children }: Props) {
  const { profile } = useSession();
  const [checking, setChecking] = useState(true);
  const [showing, setShowing] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let mounted = true;
    hasSeenWelcome().then((seen) => {
      if (!mounted) return;
      setShowing(!seen);
      setChecking(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (checking || !profile) {
    return <>{children}</>;
  }

  if (!showing) {
    return <>{children}</>;
  }

  const finish = () => {
    markWelcomeSeen().catch(() => undefined);
    setShowing(false);
  };

  const roleCopy = ROLE_COPY[profile.role] ?? ROLE_COPY.viewer;
  const steps = [
    {
      icon: 'sparkles-outline' as const,
      title: 'Bienvenido a Zaltyko',
      body: 'Tu academia, en el bolsillo: agenda, avisos y mensajes al instante.',
    },
    {
      icon: roleCopy.icon,
      title: 'Esto es lo tuyo',
      body: roleCopy.text,
    },
    {
      icon: 'finger-print-outline' as const,
      title: 'Protegemos tu sesión',
      body: 'Si tu dispositivo tiene Face ID o huella, te lo pediremos al volver tras un rato inactivo. Puedes desactivarlo cuando quieras desde Perfil.',
    },
  ];

  const current = steps[step] ?? steps[0] ?? { icon: 'sparkles-outline' as const, title: '', body: '' };
  const isLast = step === steps.length - 1;

  return (
    <View style={styles.flex}>
      <View style={styles.content}>
        <Ionicons name={current.icon} size={64} color={colors.primary} />
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.body}>{current.body}</Text>
      </View>

      <View style={styles.dots}>
        {steps.map((_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.actions}>
        {step > 0 ? (
          <Button
            title="Atrás"
            variant="ghost"
            onPress={() => setStep((s) => Math.max(0, s - 1))}
            accessibilityLabel="Volver al slide anterior"
          />
        ) : !isLast ? (
          <Button title="Saltar" variant="ghost" onPress={finish} />
        ) : (
          <View />
        )}
        <Button
          title={isLast ? 'Empezar' : 'Siguiente'}
          variant="primary"
          onPress={() => (isLast ? finish() : setStep((s) => s + 1))}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg, justifyContent: 'space-between', padding: spacing.xl },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  title: { ...typography.display, color: colors.textInverse, textAlign: 'center' },
  body: { ...typography.body, color: colors.onDarkMuted, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.borderDark },
  dotActive: { backgroundColor: colors.primary },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});

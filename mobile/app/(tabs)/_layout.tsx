// Layout de tabs. Las pestañas se eligen según el rol del perfil.
// Si no hay sesión, redirige a (auth). Si el lock biométrico está
// armado, BiometricGate muestra el overlay de desbloqueo hasta que
// el usuario se autentique con Face ID / huella.

import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { BiometricGate } from '@/components/auth/BiometricGate';
import { WelcomeGate } from '@/components/onboarding/WelcomeGate';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/lib/auth/use-session';
import { tabsForRole } from '@/lib/auth/role-router';
import { colors, spacing, typography } from '@/lib/theme';

export default function TabsLayout() {
  const { status, profile, refresh } = useSession();

  if (status === 'loading') return null;
  if (status === 'unauthenticated') return <Redirect href="/(auth)/login" />;
  if (!profile) {
    // El fetch de /api/me falló incluso tras el reintento interno de
    // SessionProvider (sin perfil previo al que volver) — mostramos un
    // estado real en vez de dejar la pantalla en blanco sin salida.
    return (
      <View style={errorStyles.flex}>
        <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
        <Text style={errorStyles.title}>No se pudo cargar tu perfil</Text>
        <Text style={errorStyles.body}>Revisa tu conexión e inténtalo de nuevo.</Text>
        <Button title="Reintentar" variant="secondary" onPress={() => refresh()} />
      </View>
    );
  }

  const tabs = tabsForRole(profile.role);

  return (
    <WelcomeGate>
      <BiometricGate>
        <Tabs
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.textInverse,
            headerTitleStyle: { fontWeight: '600' },
            tabBarActiveTintColor: colors.tabActive,
            tabBarInactiveTintColor: colors.tabInactive,
            tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
          }}
        >
          {tabs.map((tab) => (
            <Tabs.Screen
              key={tab.key}
              name={tab.key === 'home' || tab.key === 'classes' ? 'index' : tab.key}
              options={{
                title: tab.title,
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name={iconFor(tab.icon)} size={size} color={color} />
                ),
              }}
            />
          ))}
        </Tabs>
      </BiometricGate>
    </WelcomeGate>
  );
}

const errorStyles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  title: { ...typography.title, color: colors.textInverse, textAlign: 'center' },
  body: { ...typography.body, color: colors.onDarkMuted, textAlign: 'center' },
});

function iconFor(name: string): keyof typeof Ionicons.glyphMap {
  switch (name) {
    case 'home':
      return 'home-outline';
    case 'calendar':
      return 'calendar-outline';
    case 'bell':
      return 'notifications-outline';
    case 'message':
      return 'chatbubbles-outline';
    case 'user':
      return 'person-outline';
    default:
      return 'ellipse-outline';
  }
}
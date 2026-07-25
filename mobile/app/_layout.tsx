// Root layout de Expo Router. Carga los providers globales:
//   - QueryClientProvider (TanStack Query)
//   - SafeAreaProvider (status bar, notches)
//   - GestureHandlerRootView (necesario para navegación por gestos)
// Splash screen se oculta cuando Supabase resuelve la sesión inicial.
//
// El silenciamiento de warnings del simulador (LogBox + console overrides)
// se hace en lib/observability/silence-sim-warnings.ts, cargado desde
// index.ts antes de expo-router/entry, para que esté listo antes de que
// PushProvider importe expo-notifications y dispare el warning de Keychain.

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { queryClient } from '@/lib/query/client';
import { useSession } from '@/lib/auth/use-session';
import { PushProvider } from '@/lib/push/PushProvider';
import { colors } from '@/lib/theme';

// Evita que el splash se oculte automáticamente; lo controlamos aquí.
SplashScreen.preventAutoHideAsync().catch(() => {
  // noop: en dev puede fallar por hot reload
});

export default function RootLayout() {
  const session = useSession();

  useEffect(() => {
    if (session.status !== 'loading') {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [session.status]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <PushProvider>
            <StatusBar style="auto" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.bg },
                headerTintColor: colors.textInverse,
                contentStyle: { backgroundColor: colors.bg },
              }}
            >
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            </Stack>
          </PushProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
// Layout del grupo (auth). Sin header — la pantalla de login decide si mostrarlo.
// Si ya hay sesión, redirige a (tabs).

import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/lib/auth/use-session';

export default function AuthLayout() {
  const { status } = useSession();

  if (status === 'authenticated') {
    return <Redirect href="/(tabs)" />;
  }
  if (status === 'loading') {
    return null; // Splash se mantiene mientras hidrata sesión
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="login" />
    </Stack>
  );
}
// Registra el dispositivo del usuario en Expo Push y guarda el token
// en el backend Zaltyko vía /api/push-tokens (que ya existe y usa
// withBearerTenant + tabla push_tokens).
//
// Por qué EXPO_PUBLIC_EAS_PROJECT_ID:
// - `getExpoPushTokenAsync` lo necesita para builds de producción
//   (development builds no lo requieren). En dev basta con omitirlo.
// - Se inyecta en build desde .env (process.env) y se copia a
//   app.json extra.eas.projectId por `eas env` o manualmente.

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { apiPost } from '@/lib/api/client';
import { ensurePushPermission } from './permissions';

export interface RegisteredToken {
  token: string;
  platform: 'ios' | 'android';
}

export async function registerForPushNotifications(): Promise<RegisteredToken | null> {
  const granted = await ensurePushPermission();
  if (!granted) return null;

  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || undefined;

  try {
    const expoToken = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : {}
    );

    const platform: 'ios' | 'android' =
      Platform.OS === 'ios' ? 'ios' : 'android';

    // Persistir en backend. Si falla, log y seguir — la app funciona
    // sin push; el usuario puede tener notificaciones web como fallback.
    await apiPost('/api/push-tokens', {
      token: expoToken.data,
      platform,
    }).catch((err) => {
      console.warn('[push] failed to register token with backend:', err);
    });

    // Android: crear canal por defecto (Expo lo hace, pero lo dejamos
    // explícito para que las notificaciones lleguen cuando la app está
    // cerrada con importancia por defecto).
    if (platform === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Zaltyko',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4F46E5',
        sound: 'default',
      });
    }

    return { token: expoToken.data, platform };
  } catch (err) {
    console.warn('[push] getExpoPushTokenAsync failed:', err);
    return null;
  }
}
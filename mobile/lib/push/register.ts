// Registra el dispositivo del usuario en Expo Push y guarda el token
// en el backend Zaltyko vía /api/push-tokens (que ya existe y usa
// withBearerTenant + tabla push_tokens).
//
// `eas init` escribe el projectId canónico en app.json. Expo Constants lo
// expone en runtime; no se duplica en una variable EXPO_PUBLIC_*.

import Constants from 'expo-constants';
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

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  try {
    const platform: 'ios' | 'android' =
      Platform.OS === 'ios' ? 'ios' : 'android';

    // Android exige crear el canal antes de solicitar el token/permisos.
    if (platform === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Zaltyko',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4F46E5',
        sound: 'default',
      });
    }

    if (!projectId) {
      throw new Error(
        'EAS projectId no configurado; ejecuta eas init con la cuenta del board'
      );
    }

    const expoToken = await Notifications.getExpoPushTokenAsync({ projectId });

    // Persistir en backend. Si falla, log y seguir — la app funciona
    // sin push; el usuario puede tener notificaciones web como fallback.
    await apiPost('/api/push-tokens', {
      token: expoToken.data,
      platform,
    }).catch((err) => {
      console.warn('[push] failed to register token with backend:', err);
    });

    return { token: expoToken.data, platform };
  } catch (err) {
    console.warn('[push] getExpoPushTokenAsync failed:', err);
    return null;
  }
}

// Pedir permiso de notificaciones. iOS requiere prompt explícito;
// Android 13+ también (en <13 se concede en install). En simulador
// devolvemos false para evitar tokens inválidos.

import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

export async function ensurePushPermission(): Promise<boolean> {
  if (!Device.isDevice) return false;

  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;

  const { status: newStatus } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  return newStatus === 'granted';
}
// Configuración de cómo se muestran las notificaciones cuando la app
// está en foreground, y hook para reaccionar a taps.
//
// `setNotificationHandler` debe llamarse ANTES de que llegue la primera
// notificación — lo invocamos al cargar este módulo (top-level).

import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import type { EventSubscription } from 'expo-modules-core';
import { useRouter } from 'expo-router';

// Esto decide qué pasa cuando llega una push y la app está abierta.
// Por defecto Expo la descarta — queremos banner + lista in-app.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

interface PushData {
  // Convención Zaltyko: el backend mete `url` en `data` para deep linking.
  url?: string;
  // Otros campos arbitrarios (claseId, invoiceId, etc.) según el caso.
  [key: string]: unknown;
}

/**
 * Suscribe listeners para notificaciones recibidas (foreground) y taps.
 * Devuelve función de cleanup. Se monta una vez por sesión autenticada.
 */
export function usePushNotificationHandler(): void {
  const router = useRouter();

  useEffect(() => {
    const receivedSub: EventSubscription =
      Notifications.addNotificationReceivedListener((_notification) => {
        // Foreground: ya mostraremos banner por setNotificationHandler.
        // Aquí podríamos actualizar TanStack Query si la push trae
        // datos mutables (nuevo mensaje, factura, etc.). Por ahora
        // solo log para verificar el pipeline.
      });

    const responseSub: EventSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = (response.notification.request.content.data ?? {}) as PushData;
        // Si el backend incluye `url`, navegar ahí. Si no, ir a avisos.
        if (data.url && typeof data.url === 'string') {
          // Tipos de Expo Router: aceptamos strings sin tipo estricto
          // para permitir deep links arbitrarios que el backend defina.
          router.push(data.url as never);
        } else {
          router.push('/(tabs)/notifications');
        }
      });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [router]);
}
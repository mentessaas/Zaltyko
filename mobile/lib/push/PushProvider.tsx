// PushProvider: monta los listeners de notificaciones y registra el
// token Expo del dispositivo cada vez que el usuario inicia sesión.
//
// Decisiones:
// - Registramos en cada login (idempotente — el backend hace upsert).
// - NO desregistramos al cerrar sesión: el usuario puede volver a
//   entrar con el mismo dispositivo y el token sigue siendo válido.
// - Si el token cambia (raro, pero puede pasar al reinstalar), el
//   upsert lo refresca automáticamente en el backend.

import { useEffect, type ReactNode } from 'react';

import { useSession } from '@/lib/auth/use-session';
import { registerForPushNotifications } from './register';
import { usePushNotificationHandler } from './handler';

interface Props {
  children: ReactNode;
}

export function PushProvider({ children }: Props) {
  const { status } = useSession();

  // Listeners (deep link + foreground) — siempre activos.
  usePushNotificationHandler();

  // Registro del token: solo cuando hay sesión autenticada.
  useEffect(() => {
    if (status !== 'authenticated') return;

    let cancelled = false;
    registerForPushNotifications()
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          console.log('[push] not registered (no permission or not a device)');
        } else {
          console.log('[push] registered', result.platform, 'token', result.token.slice(0, 20) + '...');
        }
      })
      .catch((err) => {
        console.warn('[push] register error:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  return <>{children}</>;
}
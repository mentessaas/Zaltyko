// Wrapper ligero sobre Supabase Realtime para la app móvil.
// Solo cubre el caso de uso del MVP: avisos en vivo del usuario actual.
//
// Contrato:
//   - subscribeToUserNotifications(profileId, onNew) se conecta al
//     canal `notifications:user_id=eq.<id>` y solo emite eventos INSERT.
//   - Devuelve una función de cleanup que elimina el canal.
//   - El cliente supabase ya carga el access JWT desde SecureStore; no
//     hace falta setAuth manual. Si la sesión expira, Realtime cierra
//     el socket y este `subscribe` devolverá un canal que ya no emite.
//     El siguiente `refetch` lo traerá de vuelta desde la API normal.

import { supabase } from '@/lib/auth/supabase';
import type { NotificationItem } from '@/lib/api/endpoints';

type NotificationInsert = NotificationItem & {
  user_id?: string;
  tenant_id?: string;
};

export function subscribeToUserNotifications(
  profileId: string,
  onNew: (n: NotificationItem) => void
): () => void {
  const channel = supabase
    .channel(`realtime:notifications:${profileId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${profileId}`,
      },
      (payload) => {
        const row = payload.new as NotificationInsert;
        onNew({
          id: row.id,
          type: row.type,
          title: row.title,
          message: row.message,
          read: row.read,
          readAt: row.readAt,
          createdAt: row.createdAt,
          data: row.data,
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
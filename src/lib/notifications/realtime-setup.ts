import { subscribeToNotifications } from "@/lib/supabase/realtime-helpers";

/**
 * Configura y suscribe a notificaciones en tiempo real usando Supabase Realtime
 */
export function setupRealtimeNotifications(
  userId: string,
  tenantId: string,
  onNotification: (notification: any) => void
) {
  return subscribeToNotifications(userId, tenantId, onNotification);
}

/**
 * Hook para usar notificaciones en tiempo real en componentes React
 * 
 * Uso:
 * ```tsx
 * useEffect(() => {
 *   if (!userId || !tenantId) return;
 *   const cleanup = useRealtimeNotifications(userId, tenantId, (notification) => {
 *     // Manejar nueva notificación
 *   });
 *   return cleanup;
 * }, [userId, tenantId]);
 * ```
 */
export function useRealtimeNotifications(
  userId: string | null,
  tenantId: string | null,
  onNotification: (notification: any) => void
): (() => void) | undefined {
  if (typeof window === "undefined" || !userId || !tenantId) {
    return undefined;
  }

  const cleanup = setupRealtimeNotifications(userId, tenantId, onNotification);
  return cleanup;
}


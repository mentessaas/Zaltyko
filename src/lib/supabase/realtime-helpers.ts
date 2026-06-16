import { createClient } from "./client";

/**
 * Configura una suscripción a cambios en tiempo real de una tabla
 */
export function subscribeToTable<T = any>(
  table: string,
  filter: string,
  callback: (payload: { new: T; old: T | null; eventType: "INSERT" | "UPDATE" | "DELETE" }) => void
) {
  const supabase = createClient();

  const channel = supabase
    .channel(`realtime:${table}:${filter}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
        filter,
      },
      (payload) => {
        callback({
          new: payload.new as T,
          old: payload.old as T | null,
          eventType: payload.eventType as "INSERT" | "UPDATE" | "DELETE",
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Suscribe a nuevas notificaciones para un usuario
 */
export function subscribeToNotifications(
  userId: string,
  tenantId: string,
  onNotification: (notification: any) => void
) {
  return subscribeToTable(
    "notifications",
    `user_id=eq.${userId}`,
    (payload) => {
      if (payload.eventType === "INSERT") {
        onNotification(payload.new);
      }
    }
  );
}

/**
 * Suscribe a cambios en una tabla específica con filtro de tenant
 */
export function subscribeToTenantTable<T = any>(
  table: string,
  tenantId: string,
  callback: (payload: { new: T; old: T | null; eventType: "INSERT" | "UPDATE" | "DELETE" }) => void
) {
  return subscribeToTable<T>(table, `tenant_id=eq.${tenantId}`, callback);
}


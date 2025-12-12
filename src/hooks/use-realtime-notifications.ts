"use client";

import { useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast-provider";

interface RealtimeNotification {
  id: string;
  type: "user_suspended" | "user_reactivated" | "plan_changed" | "subscription_updated" | "academy_created" | "academy_updated" | "class_created" | "class_updated" | "session_created" | "billing_invoice_created" | "contact_message";
  title: string;
  description: string;
  userId?: string;
  profileId?: string;
  academyId?: string;
  timestamp: string;
}

interface UseRealtimeNotificationsOptions {
  userId?: string | null;
  tenantId?: string | null;
  enabled?: boolean;
  onNotification?: (notification: RealtimeNotification) => void;
}

export function useRealtimeNotifications({
  userId,
  tenantId,
  enabled = true,
  onNotification,
}: UseRealtimeNotificationsOptions = {}) {
  const supabase = createClient();
  const toast = useToast();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const handleNotification = useCallback(
    (notification: RealtimeNotification) => {
      // Solo mostrar notificaciones relevantes para el usuario actual
      if (userId && notification.userId && notification.userId !== userId) {
        return;
      }

      // Mostrar toast
      toast.pushToast({
        title: notification.title,
        description: notification.description,
        variant: notification.type.includes("suspended") || notification.type.includes("error") ? "error" : "success",
        duration: 6000,
      });

      // Callback personalizado
      onNotification?.(notification);
    },
    [userId, toast, onNotification]
  );

  useEffect(() => {
    if (!enabled) return;

    // Suscribirse a cambios en profiles para notificaciones de suspensión/reactivación
    const profilesChannel = supabase
      .channel("profiles-changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: userId ? `user_id=eq.${userId}` : undefined,
        },
        (payload: any) => {
          const oldRecord = payload.old_record as { is_suspended?: boolean; name?: string } | null;
          const newRecord = payload.new_record as { is_suspended?: boolean; name?: string; user_id: string; id: string };

          if (oldRecord?.is_suspended !== newRecord.is_suspended) {
            handleNotification({
              id: `profile-${newRecord.id}-${Date.now()}`,
              type: newRecord.is_suspended ? "user_suspended" : "user_reactivated",
              title: newRecord.is_suspended ? "Cuenta suspendida" : "Cuenta reactivada",
              description: newRecord.is_suspended
                ? "Tu cuenta ha sido suspendida. No podrás acceder al sistema hasta que sea reactivada."
                : "Tu cuenta ha sido reactivada. Ya puedes acceder al sistema nuevamente.",
              userId: newRecord.user_id,
              profileId: newRecord.id,
              timestamp: new Date().toISOString(),
            });
          }
        }
      )
      .subscribe();

    // Suscribirse a cambios en subscriptions para notificaciones de plan
    const subscriptionsChannel = supabase
      .channel("subscriptions-changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "subscriptions",
          filter: userId ? `user_id=eq.${userId}` : undefined,
        },
        async (payload) => {
          const newRecord = (payload as any).new_record as { user_id: string; plan_id?: string; status?: string };
          
          // Obtener información del plan si cambió
          if (newRecord.plan_id) {
            const { data: plan } = await supabase.from("plans").select("code, nickname").eq("id", newRecord.plan_id).single();
            
            if (plan) {
              handleNotification({
                id: `subscription-${newRecord.user_id}-${Date.now()}`,
                type: "plan_changed",
                title: "Plan actualizado",
                description: `Tu plan ha sido cambiado a ${plan.nickname || plan.code.toUpperCase()}.`,
                userId: newRecord.user_id,
                timestamp: new Date().toISOString(),
              });
            }
          }

          if (newRecord.status === "canceled" || newRecord.status === "past_due") {
            handleNotification({
              id: `subscription-${newRecord.user_id}-${Date.now()}`,
              type: "subscription_updated",
              title: "Suscripción actualizada",
              description: `El estado de tu suscripción ha cambiado a ${newRecord.status}.`,
              userId: newRecord.user_id,
              timestamp: new Date().toISOString(),
            });
          }
        }
      )
      .subscribe();

    // Suscribirse a cambios en academies para notificaciones de creación/actualización
    const academiesChannel = supabase
      .channel("academies-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "academies",
        },
        (payload) => {
          const record = (payload as any).new_record as { id: string; name?: string; owner_id?: string } | null;
          const oldRecord = (payload as any).old_record as { name?: string } | null;

          if (!record) return;

          if (payload.eventType === "INSERT") {
            handleNotification({
              id: `academy-${record.id}-${Date.now()}`,
              type: "academy_created",
              title: "Nueva academia creada",
              description: `La academia "${record.name || "Sin nombre"}" ha sido creada.`,
              academyId: record.id,
              timestamp: new Date().toISOString(),
            });
          } else if (payload.eventType === "UPDATE" && oldRecord?.name !== record.name) {
            handleNotification({
              id: `academy-${record.id}-${Date.now()}`,
              type: "academy_updated",
              title: "Academia actualizada",
              description: `La academia ha sido actualizada: "${oldRecord?.name || "Sin nombre"}" → "${record.name || "Sin nombre"}".`,
              academyId: record.id,
              timestamp: new Date().toISOString(),
            });
          }
        }
      )
      .subscribe();

    // Suscribirse a cambios en classes para notificaciones de clases
    const classesChannel = supabase
      .channel("classes-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "classes",
        },
        (payload) => {
          const record = (payload as any).new_record as { id: string; name?: string; academy_id?: string } | null;

          if (!record) return;

          if (payload.eventType === "INSERT") {
            handleNotification({
              id: `class-${record.id}-${Date.now()}`,
              type: "class_created",
              title: "Nueva clase creada",
              description: `La clase "${record.name || "Sin nombre"}" ha sido creada.`,
              academyId: record.academy_id,
              timestamp: new Date().toISOString(),
            });
          }
        }
      )
      .subscribe();

    // Suscribirse a cambios en billing_invoices para notificaciones de facturación
    const billingChannel = supabase
      .channel("billing-invoices-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "billing_invoices",
          filter: tenantId ? `tenant_id=eq.${tenantId}` : undefined,
        },
        (payload: any) => {
          const record = payload.new_record as { 
            id: string; 
            tenant_id: string | null;
            academy_id: string;
            amount_paid?: number | null;
            amount_due?: number | null;
            status?: string;
          } | null;

          if (!record) return;
          
          // Solo mostrar notificaciones para el tenant del usuario actual
          if (tenantId && record.tenant_id !== tenantId) {
            return;
          }

          const amount = record.amount_paid ?? record.amount_due ?? 0;
          const amountFormatted = amount > 0 ? `€${(amount / 100).toFixed(2)}` : "un monto pendiente";

          handleNotification({
            id: `billing-invoice-${record.id}-${Date.now()}`,
            type: "billing_invoice_created",
            title: "Nueva factura generada",
            description: `Se ha generado una nueva factura por ${amountFormatted}.`,
            userId: userId ?? undefined,
            academyId: record.academy_id,
            timestamp: new Date().toISOString(),
          });
        }
      )
      .subscribe();

    // Suscribirse a cambios en contact_messages para notificaciones de mensajes de contacto
    const contactMessagesChannel = supabase
      .channel("contact-messages-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "contact_messages",
        },
        async (payload: any) => {
          const record = payload.new_record as {
            id: string;
            academy_id: string;
            contact_name: string;
            contact_email: string;
          } | null;

          if (!record) return;

          // Obtener información de la academia para verificar acceso
          const { data: academy } = await supabase
            .from("academies")
            .select("id, name, owner_id, tenant_id")
            .eq("id", record.academy_id)
            .single();

          if (!academy) return;

          // Verificar que el usuario es propietario de la academia
          // Nota: userId aquí es el userId de Supabase Auth, necesitamos el profileId
          // Por ahora, solo notificamos si hay un userId y tenantId
          if (userId && tenantId && academy.tenant_id === tenantId) {
            handleNotification({
              id: `contact-message-${record.id}-${Date.now()}`,
              type: "contact_message",
              title: "Nuevo mensaje de contacto",
              description: `${record.contact_name} te ha enviado un mensaje para ${academy.name || "tu academia"}.`,
              academyId: record.academy_id,
              timestamp: new Date().toISOString(),
            });
          }
        }
      )
      .subscribe();

    channelRef.current = profilesChannel;

    return () => {
      profilesChannel.unsubscribe();
      subscriptionsChannel.unsubscribe();
      academiesChannel.unsubscribe();
      classesChannel.unsubscribe();
      billingChannel.unsubscribe();
      contactMessagesChannel.unsubscribe();
    };
  }, [enabled, userId, tenantId, handleNotification, supabase]);

  return {
    isConnected: channelRef.current !== null,
  };
}


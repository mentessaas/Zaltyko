"use client";

import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NotificationCenter } from "./NotificationCenter";
import { useRealtimeNotifications } from "@/lib/notifications/realtime-setup";

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    // Obtener userId y tenantId del contexto/sesión
    // TODO: Obtener de la sesión real
    loadUnreadCount();
  }, []);

  // Configurar notificaciones en tiempo real
  useEffect(() => {
    if (!userId || !tenantId) return;

    const cleanup = useRealtimeNotifications(
      userId,
      tenantId,
      (notification) => {
        // Nueva notificación recibida
        setUnreadCount((prev) => prev + 1);
        // Opcional: mostrar notificación toast
        // Puedes agregar un toast aquí si tienes un sistema de toasts
      }
    );

    return cleanup;
  }, [userId, tenantId]);

  useEffect(() => {
    if (userId && tenantId) {
      loadUnreadCount();
      // Recargar cada 30 segundos como fallback
      const interval = setInterval(loadUnreadCount, 30000);
      return () => clearInterval(interval);
    }
  }, [userId, tenantId]);

  const loadUnreadCount = async () => {
    try {
      const response = await fetch("/api/notifications/unread-count");
      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.count || 0);
      }
    } catch (error) {
      console.error("Error loading unread count:", error);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        )}
      </Button>
      {isOpen && (
        <NotificationCenter
          open={isOpen}
          onClose={() => setIsOpen(false)}
          onNotificationRead={loadUnreadCount}
        />
      )}
    </>
  );
}


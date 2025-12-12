"use client";

import { useState, useEffect, useMemo } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NotificationCenter } from "./NotificationCenter";
import { useRealtimeNotifications } from "@/hooks/use-realtime-notifications";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { createClient } from "@/lib/supabase/client";

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);
  const academyContext = useAcademyContext();
  const tenantId = academyContext?.tenantId ?? null;

  // Obtener userId de la sesión
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active && data.user) {
        setUserId(data.user.id);
      }
    });
    return () => {
      active = false;
    };
  }, [supabase]);

  // Configurar notificaciones en tiempo real
  useRealtimeNotifications({
    userId: userId ?? undefined,
    tenantId: tenantId ?? undefined,
    enabled: !!userId && !!tenantId,
    onNotification: () => {
      // Nueva notificación recibida
      setUnreadCount((prev) => prev + 1);
    },
  });

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
            variant="error"
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


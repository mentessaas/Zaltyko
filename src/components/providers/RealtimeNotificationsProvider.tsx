"use client";

import { useEffect } from "react";
import { useRealtimeNotifications } from "@/hooks/use-realtime-notifications";

interface RealtimeNotificationsProviderProps {
  userId?: string | null;
  tenantId?: string | null;
  enabled?: boolean;
}

export function RealtimeNotificationsProvider({ 
  userId, 
  tenantId,
  enabled = true 
}: RealtimeNotificationsProviderProps) {
  useRealtimeNotifications({
    userId,
    tenantId,
    enabled,
  });

  return null;
}


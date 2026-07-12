"use client";

import { useState, useEffect, useCallback } from "react";

export interface OfflineStatusState {
  isOnline: boolean;
  wasOffline: boolean;
  pendingOperationsCount: number;
  refreshPendingCount: () => Promise<void>;
}

export function useOfflineStatus(): OfflineStatusState {
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPendingCount = useCallback(async () => {
    // Offline mutations are intentionally disabled until they have
    // tenant-scoped idempotency and conflict resolution.
    setPendingCount(0);
  }, []);

  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      if (!navigator.onLine) return;
      // We were offline, now we're back
      setWasOffline(true);
      // Refresh pending count after coming back online
      refreshPendingCount();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    // Initial pending count
    refreshPendingCount();

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshPendingCount]);

  return {
    isOnline,
    wasOffline,
    pendingOperationsCount: pendingCount,
    refreshPendingCount,
  };
}

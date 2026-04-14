"use client";

import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { WifiOff, RefreshCw } from "lucide-react";
import { Button } from "./button";

export function OfflineBanner() {
  const { isOnline, pendingOperationsCount, refreshPendingCount } =
    useOfflineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-zaltyko-accent-coral text-white py-2 px-4">
      <div className="flex items-center justify-center gap-2 text-sm">
        <WifiOff className="h-4 w-4 flex-shrink-0" />
        <span>Sin conexión a internet</span>
        {pendingOperationsCount > 0 && (
          <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
            {pendingOperationsCount} pendiente{pendingOperationsCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// Compact version for embedding in other banners
export function OfflineIndicator() {
  const { isOnline } = useOfflineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div className="inline-flex items-center gap-1.5 text-zaltyko-accent-coral text-sm">
      <WifiOff className="h-3.5 w-3.5" />
      <span>Offline</span>
    </div>
  );
}

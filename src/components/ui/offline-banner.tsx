"use client";

import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const { isOnline } = useOfflineStatus();

  if (isOnline) {
    return null;
  }

  // Show offline banner when not online
  if (!isOnline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-zaltyko-accent-coral text-white py-2 px-4">
        <div className="flex items-center justify-center gap-2 text-sm">
          <WifiOff className="h-4 w-4 flex-shrink-0" />
          <span>Sin conexión a internet</span>
        </div>
      </div>
    );
  }

  return null;
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

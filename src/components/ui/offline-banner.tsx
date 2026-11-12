"use client";

import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const { isOnline } = useOfflineStatus();

  if (isOnline) {
    return null;
  }

  // Sin conexión es un aviso (ocre), no un error: se puede seguir trabajando.
  if (!isOnline) {
    return (
      <div className="fixed left-0 right-0 top-0 z-50 border-b border-ochre-line bg-ochre-wash px-4 py-2 text-ochre-ink">
        <div className="flex items-center justify-center gap-2 text-sm font-semibold">
          <WifiOff className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
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
    <div className="inline-flex items-center gap-1.5 text-sm text-ochre-ink">
      <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
      <span>Offline</span>
    </div>
  );
}

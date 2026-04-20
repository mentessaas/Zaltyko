"use client";

import { useState, useCallback } from "react";
import { RefreshCw, CheckCircle, AlertCircle, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { syncOperations } from "@/lib/offline/operations-queue";

interface SyncStatusProps {
  className?: string;
}

export function SyncStatus({ className }: SyncStatusProps) {
  const { isOnline, pendingOperationsCount, refreshPendingCount } = useOfflineStatus();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{
    success: boolean;
    synced: number;
    failed: number;
    message: string;
  } | null>(null);

  const handleSync = useCallback(async () => {
    if (!isOnline || isSyncing) return;

    setIsSyncing(true);
    setLastSyncResult(null);

    try {
      const result = await syncOperations();

      await refreshPendingCount();

      if (result.failed === 0 && result.synced === 0) {
        setLastSyncResult({
          success: true,
          synced: 0,
          failed: 0,
          message: "Todo sincronizado",
        });
      } else if (result.failed === 0) {
        setLastSyncResult({
          success: true,
          synced: result.synced,
          failed: 0,
          message: `${result.synced} operación${result.synced !== 1 ? "es" : ""} sincronizada${result.synced !== 1 ? "s" : ""}`,
        });
      } else {
        setLastSyncResult({
          success: false,
          synced: result.synced,
          failed: result.failed,
          message: `${result.synced} sincronizada${result.synced !== 1 ? "s" : ""}, ${result.failed} fallida${result.failed !== 1 ? "s" : ""}`,
        });
      }
    } catch (error) {
      setLastSyncResult({
        success: false,
        synced: 0,
        failed: 1,
        message: "Error al sincronizar",
      });
    } finally {
      setIsSyncing(false);

      // Clear result after 3 seconds
      setTimeout(() => {
        setLastSyncResult(null);
      }, 3000);
    }
  }, [isOnline, isSyncing, refreshPendingCount]);

  // Don't render anything if online and no pending operations
  if (isOnline && pendingOperationsCount === 0 && !lastSyncResult) {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 ${className || ""}`}>
      {/* Status indicator */}
      {!isOnline && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <WifiOff className="h-4 w-4" />
          <span className="text-xs">Sin conexión</span>
        </div>
      )}

      {/* Pending count badge */}
      {pendingOperationsCount > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            {pendingOperationsCount} pendiente{pendingOperationsCount !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Sync button */}
      {isOnline && pendingOperationsCount > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={isSyncing}
          className="h-7 text-xs"
        >
          {isSyncing ? (
            <>
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              Sincronizando...
            </>
          ) : (
            <>
              <RefreshCw className="h-3 w-3 mr-1" />
              Sincronizar
            </>
          )}
        </Button>
      )}

      {/* Last sync result */}
      {lastSyncResult && (
        <div
          className={`flex items-center gap-1.5 text-xs ${
            lastSyncResult.success ? "text-green-600" : "text-red-600"
          }`}
        >
          {lastSyncResult.success ? (
            <CheckCircle className="h-3 w-3" />
          ) : (
            <AlertCircle className="h-3 w-3" />
          )}
          <span>{lastSyncResult.message}</span>
        </div>
      )}
    </div>
  );
}

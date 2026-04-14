// Operations queue for offline support
// Queues operations when offline, syncs when back online

import { openDB, getAll, put, deleteRecord, type PendingOperation } from "./db";

const MAX_RETRIES = 3;

export type OperationType =
  | "athlete:create"
  | "athlete:update"
  | "athlete:delete"
  | "enrollment:create"
  | "enrollment:cancel"
  | "class:update"
  | "attendance:mark"
  | "payment:record";

export interface QueuedOperation {
  id: string;
  type: OperationType;
  payload: Record<string, unknown>;
  timestamp: number;
  retries: number;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Queue a new operation
export async function queueOperation(
  type: OperationType,
  payload: Record<string, unknown>
): Promise<string> {
  const operation: QueuedOperation = {
    id: generateId(),
    type,
    payload,
    timestamp: Date.now(),
    retries: 0,
  };

  await put("pendingOperations", operation);
  return operation.id;
}

// Get all pending operations sorted by timestamp
export async function getPendingOperations(): Promise<QueuedOperation[]> {
  const operations = await getAll<QueuedOperation>("pendingOperations");
  return operations.sort((a, b) => a.timestamp - b.timestamp);
}

// Get count of pending operations
export async function getPendingOperationsCount(): Promise<number> {
  const operations = await getPendingOperations();
  return operations.length;
}

// Remove a specific operation after successful sync
export async function removeOperation(id: string): Promise<void> {
  await deleteRecord("pendingOperations", id);
}

// Remove all pending operations
export async function clearPendingOperations(): Promise<void> {
  const { clear } = await import("./db");
  await clear("pendingOperations");
}

// Execute a single operation against the API
async function executeOperation(
  operation: QueuedOperation
): Promise<{ success: boolean; error?: string }> {
  const endpointMap: Record<OperationType, string> = {
    "athlete:create": "/api/athletes",
    "athlete:update": `/api/athletes/${operation.payload.id}`,
    "athlete:delete": `/api/athletes/${operation.payload.id}`,
    "enrollment:create": "/api/enrollments",
    "enrollment:cancel": `/api/enrollments/${operation.payload.id}`,
    "class:update": `/api/classes/${operation.payload.id}`,
    "attendance:mark": "/api/attendance",
    "payment:record": "/api/payments",
  };

  const methodMap: Record<OperationType, string> = {
    "athlete:create": "POST",
    "athlete:update": "PATCH",
    "athlete:delete": "DELETE",
    "enrollment:create": "POST",
    "enrollment:cancel": "DELETE",
    "class:update": "PATCH",
    "attendance:mark": "POST",
    "payment:record": "POST",
  };

  const endpoint = endpointMap[operation.type];
  const method = methodMap[operation.type];

  if (!endpoint) {
    return { success: false, error: `Unknown operation type: ${operation.type}` };
  }

  try {
    const response = await fetch(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: method !== "DELETE" ? JSON.stringify(operation.payload) : undefined,
    });

    if (response.ok) {
      return { success: true };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: errorData.error || `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

// Sync all pending operations
export async function syncOperations(): Promise<{
  synced: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}> {
  const operations = await getPendingOperations();
  const results = {
    synced: 0,
    failed: 0,
    errors: [] as Array<{ id: string; error: string }>,
  };

  for (const operation of operations) {
    const result = await executeOperation(operation);

    if (result.success) {
      await removeOperation(operation.id);
      results.synced++;
    } else {
      // Increment retry count
      operation.retries++;

      if (operation.retries >= MAX_RETRIES) {
        // Max retries reached, remove from queue
        await removeOperation(operation.id);
        results.failed++;
        results.errors.push({ id: operation.id, error: result.error || "Max retries reached" });
      } else {
        // Update retry count and keep in queue
        await put("pendingOperations", operation);
        results.failed++;
        results.errors.push({ id: operation.id, error: result.error || "Sync failed" });
      }
    }
  }

  return results;
}

// Register background sync (called from service worker)
export async function registerBackgroundSync(): Promise<void> {
  if ("serviceWorker" in navigator && "sync" in (window as Window & { sync?: unknown })) {
    const registration = await navigator.serviceWorker.ready;
    // @ts-expect-error - sync is not in TypeScript types yet
    await registration.sync.register("pending-operations");
  }
}

// IndexedDB wrapper for offline storage
// Uses promises for cleaner async code

const DB_NAME = "zaltyko-offline";
const DB_VERSION = 1;

export interface PendingOperation {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  retries: number;
}

interface DBSchema {
  pendingOperations: PendingOperation;
  cachedData: {
    key: string;
    data: unknown;
    timestamp: number;
  };
}

let dbInstance: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error("Failed to open IndexedDB"));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Store for pending operations
      if (!db.objectStoreNames.contains("pendingOperations")) {
        const store = db.createObjectStore("pendingOperations", {
          keyPath: "id",
        });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("type", "type", { unique: false });
      }

      // Store for cached data
      if (!db.objectStoreNames.contains("cachedData")) {
        const store = db.createObjectStore("cachedData", {
          keyPath: "key",
        });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

export async function get<T>(
  storeName: "pendingOperations" | "cachedData",
  key: string
): Promise<T | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.get(key);

    request.onerror = () => {
      reject(new Error(`Failed to get ${key} from ${storeName}`));
    };

    request.onsuccess = () => {
      resolve(request.result ?? null);
    };
  });
}

export async function put<T extends object>(
  storeName: "pendingOperations" | "cachedData",
  data: T
): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.put(data);

    request.onerror = () => {
      reject(new Error(`Failed to put data in ${storeName}`));
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}

export async function deleteRecord(
  storeName: "pendingOperations" | "cachedData",
  key: string
): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);

    request.onerror = () => {
      reject(new Error(`Failed to delete ${key} from ${storeName}`));
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}

export async function clear(
  storeName: "pendingOperations" | "cachedData"
): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onerror = () => {
      reject(new Error(`Failed to clear ${storeName}`));
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}

export async function getAll<T>(
  storeName: "pendingOperations" | "cachedData"
): Promise<T[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onerror = () => {
      reject(new Error(`Failed to get all from ${storeName}`));
    };

    request.onsuccess = () => {
      resolve(request.result as T[]);
    };
  });
}

// Cache data with timestamp
export async function cacheData<T>(
  key: string,
  data: T,
  ttlMs: number = 1000 * 60 * 60
): Promise<void> {
  const record = {
    key,
    data,
    timestamp: Date.now() + ttlMs,
  };
  await put("cachedData", record);
}

// Get cached data if not expired
export async function getCachedData<T>(key: string): Promise<T | null> {
  const record = await get<{ key: string; data: T; timestamp: number }>(
    "cachedData",
    key
  );

  if (!record) return null;
  if (Date.now() > record.timestamp) {
    // Expired, delete it
    await deleteRecord("cachedData", key);
    return null;
  }

  return record.data;
}

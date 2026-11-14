import type { QueuedMark, TodaySnapshot } from "./types";

/**
 * Almacén local. Dos implementaciones: IndexedDB (navegador) y memoria
 * (pruebas, y navegadores sin IndexedDB). La lógica de la cola solo conoce
 * esta interfaz.
 */
export interface OfflineStore {
  putSnapshot(snapshot: TodaySnapshot): Promise<void>;
  getSnapshot(key: string): Promise<TodaySnapshot | undefined>;
  listSnapshots(): Promise<TodaySnapshot[]>;
  deleteSnapshot(key: string): Promise<void>;

  putQueued(mark: QueuedMark): Promise<void>;
  getQueued(key: string): Promise<QueuedMark | undefined>;
  listQueued(): Promise<QueuedMark[]>;
  deleteQueued(key: string): Promise<void>;

  /** Borra todas las listas guardadas (con nombres), no la cola. */
  clearSnapshots(): Promise<void>;
  /** Borra todo: listas y cola. */
  clearAll(): Promise<void>;
}

export function createMemoryStore(): OfflineStore {
  const snapshots = new Map<string, TodaySnapshot>();
  const queue = new Map<string, QueuedMark>();
  // Copias, igual que haría IndexedDB: nadie debe mutar lo guardado por accidente.
  const clone = <T,>(value: T): T => structuredClone(value);

  return {
    async putSnapshot(snapshot) {
      snapshots.set(snapshot.key, clone(snapshot));
    },
    async getSnapshot(key) {
      const found = snapshots.get(key);
      return found ? clone(found) : undefined;
    },
    async listSnapshots() {
      return Array.from(snapshots.values(), clone);
    },
    async deleteSnapshot(key) {
      snapshots.delete(key);
    },
    async putQueued(mark) {
      queue.set(mark.key, clone(mark));
    },
    async getQueued(key) {
      const found = queue.get(key);
      return found ? clone(found) : undefined;
    },
    async listQueued() {
      return Array.from(queue.values(), clone);
    },
    async deleteQueued(key) {
      queue.delete(key);
    },
    async clearSnapshots() {
      snapshots.clear();
    },
    async clearAll() {
      snapshots.clear();
      queue.clear();
    },
  };
}

const DB_NAME = "zaltyko-pasar-lista";
const DB_VERSION = 1;
const SNAPSHOTS = "snapshots";
const QUEUE = "queue";

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb-request"));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexeddb-transaction"));
    tx.onabort = () => reject(tx.error ?? new Error("indexeddb-abort"));
  });
}

/** IndexedDB en bruto, sin dependencias. */
export function createIndexedDbStore(factory: IDBFactory = indexedDB): OfflineStore {
  let dbPromise: Promise<IDBDatabase> | null = null;

  const open = (): Promise<IDBDatabase> => {
    if (!dbPromise) {
      dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(SNAPSHOTS)) {
            db.createObjectStore(SNAPSHOTS, { keyPath: "key" });
          }
          if (!db.objectStoreNames.contains(QUEUE)) {
            db.createObjectStore(QUEUE, { keyPath: "key" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("indexeddb-open"));
        request.onblocked = () => reject(new Error("indexeddb-blocked"));
      }).catch((error) => {
        dbPromise = null;
        throw error;
      });
    }
    return dbPromise;
  };

  const run = async <T,>(
    storeName: string,
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> => {
    const db = await open();
    const tx = db.transaction(storeName, mode);
    const result = await requestToPromise(action(tx.objectStore(storeName)));
    if (mode === "readwrite") await transactionDone(tx);
    return result;
  };

  return {
    putSnapshot: async (snapshot) => {
      await run(SNAPSHOTS, "readwrite", (s) => s.put(snapshot));
    },
    getSnapshot: (key) => run<TodaySnapshot | undefined>(SNAPSHOTS, "readonly", (s) => s.get(key)),
    listSnapshots: () => run<TodaySnapshot[]>(SNAPSHOTS, "readonly", (s) => s.getAll()),
    deleteSnapshot: async (key) => {
      await run(SNAPSHOTS, "readwrite", (s) => s.delete(key));
    },
    putQueued: async (mark) => {
      await run(QUEUE, "readwrite", (s) => s.put(mark));
    },
    getQueued: (key) => run<QueuedMark | undefined>(QUEUE, "readonly", (s) => s.get(key)),
    listQueued: () => run<QueuedMark[]>(QUEUE, "readonly", (s) => s.getAll()),
    deleteQueued: async (key) => {
      await run(QUEUE, "readwrite", (s) => s.delete(key));
    },
    clearSnapshots: async () => {
      await run(SNAPSHOTS, "readwrite", (s) => s.clear());
    },
    clearAll: async () => {
      const db = await open();
      const tx = db.transaction([SNAPSHOTS, QUEUE], "readwrite");
      tx.objectStore(SNAPSHOTS).clear();
      tx.objectStore(QUEUE).clear();
      await transactionDone(tx);
    },
  };
}

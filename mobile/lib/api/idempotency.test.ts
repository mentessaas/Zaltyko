// Cobertura vitest del cliente de idempotencia (lib/api/idempotency.ts).
// ZAL-622 Phase 1: el contrato ZAL-619 §6.2 + AC-09 exige que repetir una
// mutación con la misma clave devuelva el mismo resultado. Este módulo
// garantiza el lado cliente: misma clave persistida para el mismo
// (kind, payload), hasta que el backend implemente `Idempotency-Key`.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getOrCreateIdempotencyKey,
  clearIdempotencyKey,
  __testing,
} from './idempotency';

// vi.hoisted garantiza que los vi.fn() existan antes del vi.mock hoisted
// (igual que en lib/onboarding/welcome.test.ts).
const storage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  getAllKeys: vi.fn(),
  multiRemove: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: storage.getItem,
    setItem: storage.setItem,
    removeItem: storage.removeItem,
    getAllKeys: storage.getAllKeys,
    multiRemove: storage.multiRemove,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Por defecto: storage vacío (getItem null, getAllKeys []).
  storage.getItem.mockResolvedValue(null);
  storage.setItem.mockResolvedValue(undefined);
  storage.removeItem.mockResolvedValue(undefined);
  storage.getAllKeys.mockResolvedValue([]);
  storage.multiRemove.mockResolvedValue(undefined);
});

describe('idempotency', () => {
  describe('UUIDv4 generator', () => {
    it('produce un string con el formato 8-4-4-4-12 hex', () => {
      const u = __testing.generateUuidv4();
      expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('dos invocaciones producen claves distintas (con probabilidad astronómica de colisión)', () => {
      const a = __testing.generateUuidv4();
      const b = __testing.generateUuidv4();
      expect(a).not.toBe(b);
    });
  });

  describe('hashPayload', () => {
    it('es estable para el mismo payload', () => {
      const h1 = __testing.hashPayload({ a: 1, b: 2 });
      const h2 = __testing.hashPayload({ a: 1, b: 2 });
      expect(h1).toBe(h2);
    });

    it('no depende del orden de claves en el objeto', () => {
      const h1 = __testing.hashPayload({ a: 1, b: 2 });
      const h2 = __testing.hashPayload({ b: 2, a: 1 });
      expect(h1).toBe(h2);
    });

    it('produce hashes distintos para payloads distintos', () => {
      const h1 = __testing.hashPayload({ a: 1 });
      const h2 = __testing.hashPayload({ a: 2 });
      expect(h1).not.toBe(h2);
    });

    it('devuelve exactamente 8 caracteres hex (lowercase)', () => {
      const h = __testing.hashPayload({ foo: 'bar' });
      expect(h).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  describe('getOrCreateIdempotencyKey', () => {
    it('genera y persiste una clave nueva si no existe', async () => {
      storage.getItem.mockResolvedValueOnce(null);

      const result = await getOrCreateIdempotencyKey('attendance.upsert', {
        sessionId: 's1',
        entries: [{ athleteId: 'a1', status: 'present' }],
      });

      expect(result.reused).toBe(false);
      expect(result.key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(storage.setItem).toHaveBeenCalledTimes(1);
      // La clave persistida es la misma que devolvemos.
      const firstCall = storage.setItem.mock.calls[0] as [string, string];
      const [, persisted] = firstCall;
      expect(persisted).toBe(result.key);
      // La clave de storage empieza con el prefijo de namespace.
      const [composite] = firstCall;
      expect(composite).toMatch(/^idem:v1:attendance\.upsert:[0-9a-f]{8}$/);
    });

    it('REUSA la clave persistida cuando el mismo payload ya tiene una', async () => {
      const existingKey = '11111111-2222-4333-8444-555555555555';
      storage.getItem.mockResolvedValueOnce(existingKey);

      const result = await getOrCreateIdempotencyKey('attendance.upsert', {
        sessionId: 's1',
        entries: [{ athleteId: 'a1', status: 'present' }],
      });

      expect(result.reused).toBe(true);
      expect(result.key).toBe(existingKey);
      expect(storage.setItem).not.toHaveBeenCalled();
    });

    it('el mismo payload con distinto orden de claves se considera igual (mismo hash)', async () => {
      const existingKey = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
      storage.getItem.mockResolvedValueOnce(existingKey);

      // El orden de claves es distinto: el hash estable los trata igual.
      const result = await getOrCreateIdempotencyKey('attendance.upsert', {
        entries: [{ athleteId: 'a1', status: 'present' }],
        sessionId: 's1', // invertido
      });

      expect(result.reused).toBe(true);
      expect(result.key).toBe(existingKey);
    });

    it('un payload distinto genera una clave distinta (segundo guardado deliberado)', async () => {
      storage.getItem.mockResolvedValueOnce(null);

      const r1 = await getOrCreateIdempotencyKey('attendance.upsert', {
        sessionId: 's1',
        entries: [{ athleteId: 'a1', status: 'present' }],
      });
      // Segundo guardado del coach con un cambio nuevo: payload distinto.
      storage.getItem.mockResolvedValueOnce(null);
      const r2 = await getOrCreateIdempotencyKey('attendance.upsert', {
        sessionId: 's1',
        entries: [{ athleteId: 'a1', status: 'absent' }],
      });

      expect(r1.reused).toBe(false);
      expect(r2.reused).toBe(false);
      expect(r1.key).not.toBe(r2.key);
    });

    it('si AsyncStorage falla al leer, devuelve clave nueva sin persistir', async () => {
      storage.getItem.mockRejectedValueOnce(new Error('Storage read failed'));

      const result = await getOrCreateIdempotencyKey('attendance.upsert', {
        sessionId: 's1',
        entries: [],
      });

      expect(result.reused).toBe(false);
      expect(result.key).toMatch(/^[0-9a-f]{8}-/);
      expect(storage.setItem).not.toHaveBeenCalled();
    });

    it('si AsyncStorage falla al escribir, devuelve la clave igual (no bloquea el guardado)', async () => {
      storage.setItem.mockRejectedValueOnce(new Error('Quota exceeded'));

      const result = await getOrCreateIdempotencyKey('attendance.upsert', {
        sessionId: 's1',
        entries: [],
      });

      expect(result.reused).toBe(false);
      // Aún así la clave es válida para enviarse al backend.
      expect(result.key).toMatch(/^[0-9a-f]{8}-/);
    });

    it('diferentes kinds NO colisionan aunque el payload sea igual', async () => {
      storage.getItem.mockResolvedValue(null);

      await getOrCreateIdempotencyKey('attendance.upsert', { x: 1 });
      await getOrCreateIdempotencyKey('communication.send', { x: 1 });

      // Dos getItem con claves compuestas distintas.
      const composites = (storage.setItem.mock.calls as Array<[string, string]>).map(
        ([k]) => k
      );
      expect(new Set(composites).size).toBe(2);
      expect(composites.some((k) => k.includes('attendance.upsert'))).toBe(true);
      expect(composites.some((k) => k.includes('communication.send'))).toBe(true);
    });
  });

  describe('clearIdempotencyKey', () => {
    it('elimina la clave persistida del namespace correcto', async () => {
      await clearIdempotencyKey('attendance.upsert', { sessionId: 's1' });
      expect(storage.removeItem).toHaveBeenCalledTimes(1);
      const [composite] = storage.removeItem.mock.calls[0] as [string, string];
      expect(composite).toMatch(/^idem:v1:attendance\.upsert:[0-9a-f]{8}$/);
    });

    it('tolera fallos de storage (best-effort)', async () => {
      storage.removeItem.mockRejectedValueOnce(new Error('Storage broken'));
      await expect(
        clearIdempotencyKey('attendance.upsert', { x: 1 }),
      ).resolves.toBeUndefined();
    });
  });
});

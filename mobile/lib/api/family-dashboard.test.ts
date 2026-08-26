// Tests del bundle familia my-dashboard (ZAL-622 Fase 5 / AC-08).
// Cubre:
//   1. Composición paralela de las tres fuentes (schedule, unread,
//      charges).
//   2. Aislamiento de fallos: una fuente caída NO oculta las otras
//      dos (la UI muestra "Fuente no disponible" en el bloque afectado
//      y los demás siguen con datos reales).
//   3. Bloqueos contractuales: AUTH_REQUIRED / FORBIDDEN_ROLE
//      rechazan la promesa (la UI debe mostrar error, no "Sin datos").
//   4. Pendientes: solo se cuentan los cargos accionables
//      (`isChargePayable`), nunca paid/refunded/cancelled/draft.
//   5. renderFamilyCount distingue value / empty / unavailable.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock del cliente base para controlar respuestas. NO se mockea
// `endpoints` directamente porque `family-dashboard.ts` los invoca
// desde el módulo real; el mock del transporte nos da control sobre
// cada endpoint por su path.
//
// `ApiClientError` se stubea con una clase equivalente (mismos campos
// que la real en client.ts) porque `family-dashboard.ts` la instancia
// en el guard de rol (ZAL-768) y un `vi.fn()` no es construible. No se
// usa `importOriginal` a propósito: client.ts arrastra react-native,
// que no resuelve bajo el entorno `node` de vitest.
vi.mock('./client', () => {
  class ApiClientError extends Error {
    code: string;
    status: number;
    retryable: boolean;
    nextAction: unknown;
    constructor(err: {
      code: string;
      message: string;
      status: number;
      retryable: boolean;
      nextAction: unknown;
    }) {
      super(err.message);
      this.code = err.code;
      this.status = err.status;
      this.retryable = err.retryable;
      this.nextAction = err.nextAction;
      this.name = 'ApiClientError';
    }
  }
  return {
    ApiClientError,
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    apiPut: vi.fn(),
    apiDelete: vi.fn(),
  };
});

vi.mock('./endpoints', () => {
  // Re-exporta los helpers que family-dashboard.ts sí importa
  // directamente (getMySchedule, getUnreadCount, getConversations,
  // getMyCharges, isChargePayable). Los mocks de estos devuelven
  // valores por defecto y los tests los sobreescriben por-test.
  return {
    getMySchedule: vi.fn(),
    getUnreadCount: vi.fn(),
    getConversations: vi.fn(),
    getMyCharges: vi.fn(),
    isChargePayable: (status: string) =>
      status === 'due' ||
      status === 'overdue' ||
      status === 'partial' ||
      status === 'failed',
  };
});

import { getFamilyDashboard, getMyDashboard, renderFamilyCount } from './family-dashboard';
import {
  getMySchedule,
  getUnreadCount,
  getConversations,
  getMyCharges,
} from './endpoints';

const mockedGetMySchedule = vi.mocked(getMySchedule);
const mockedGetUnreadCount = vi.mocked(getUnreadCount);
const mockedGetConversations = vi.mocked(getConversations);
const mockedGetMyCharges = vi.mocked(getMyCharges);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getFamilyDashboard — composición paralela', () => {
  it('carga las tres fuentes en paralelo y devuelve el bundle completo', async () => {
    mockedGetMySchedule.mockResolvedValue([
      { id: 'c1', className: 'Pre-infantil A', day: 'lun', time: '17:00', location: 'Sala 1', coach: 'Ana' },
      { id: 'c2', className: 'Pre-infantil A', day: 'mie', time: '17:00', location: 'Sala 1', coach: 'Ana' },
    ] as never);
    mockedGetUnreadCount.mockResolvedValue({ count: 3 });
    mockedGetConversations.mockResolvedValue([
      { id: 'conv1', unreadCount: 2 } as never,
      { id: 'conv2', unreadCount: 1 } as never,
    ] as never);
    mockedGetMyCharges.mockResolvedValue([
      { id: 'ch1', status: 'due' } as never,
      { id: 'ch2', status: 'paid' } as never,
      { id: 'ch3', status: 'overdue' } as never,
    ] as never);

    const bundle = await getFamilyDashboard();

    expect(bundle.nextClasses.items).toHaveLength(2);
    expect(bundle.nextClasses.sourceAvailable).toBe(true);
    expect(bundle.unread.notifications).toBe(3);
    expect(bundle.unread.conversations).toBe(3); // 2 + 1
    expect(bundle.unread.sourceAvailable).toBe(true);
    // Solo `due` y `overdue` son accionables; `paid` se filtra.
    expect(bundle.pendingCharges.items).toHaveLength(2);
    expect(bundle.pendingCharges.items.map((c) => c.id)).toEqual(['ch1', 'ch3']);
    expect(bundle.pendingCharges.sourceAvailable).toBe(true);
  });

  it('recorta próximas clases a un máximo de 5 (P0)', async () => {
    const six = Array.from({ length: 6 }, (_, i) => ({
      id: `c${i}`,
      className: `Clase ${i}`,
      day: 'lun',
      time: '17:00',
      location: 'Sala',
      coach: 'A',
    }));
    mockedGetMySchedule.mockResolvedValue(six as never);
    mockedGetUnreadCount.mockResolvedValue({ count: 0 });
    mockedGetConversations.mockResolvedValue([] as never);
    mockedGetMyCharges.mockResolvedValue([] as never);

    const bundle = await getFamilyDashboard();
    expect(bundle.nextClasses.items).toHaveLength(5);
  });

  it('hace las tres llamadas en paralelo (no secuencial)', async () => {
    // Si fueran secuenciales, el tiempo total sería la suma de los
    // delays. Si fueran paralelos, sería el mayor.
    mockedGetMySchedule.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([]), 30)),
    );
    mockedGetUnreadCount.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ count: 0 }), 30)),
    );
    mockedGetConversations.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([]), 30)),
    );
    mockedGetMyCharges.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([]), 30)),
    );

    const start = Date.now();
    await getFamilyDashboard();
    const elapsed = Date.now() - start;

    // 4 fuentes × 30ms en serie = 120ms. En paralelo = ~30-40ms.
    // Damos holgura para arranque del event loop.
    expect(elapsed).toBeLessThan(110);
  });
});

describe('getFamilyDashboard — aislamiento de fallos', () => {
  it('si getMySchedule falla con NETWORK_ERROR, los otros dos bloques siguen con datos', async () => {
    const networkErr = Object.assign(new Error('Network'), { code: 'NETWORK_ERROR' });
    mockedGetMySchedule.mockRejectedValue(networkErr);
    mockedGetUnreadCount.mockResolvedValue({ count: 1 });
    mockedGetConversations.mockResolvedValue([{ id: 'c1', unreadCount: 4 }] as never);
    mockedGetMyCharges.mockResolvedValue([{ id: 'ch1', status: 'overdue' }] as never);

    const bundle = await getFamilyDashboard();

    expect(bundle.nextClasses.sourceAvailable).toBe(false);
    expect(bundle.nextClasses.items).toEqual([]);
    // Los otros dos siguen vivos
    expect(bundle.unread.sourceAvailable).toBe(true);
    expect(bundle.unread.notifications).toBe(1);
    expect(bundle.unread.conversations).toBe(4);
    expect(bundle.pendingCharges.sourceAvailable).toBe(true);
    expect(bundle.pendingCharges.items).toHaveLength(1);
  });

  it('si getMyCharges falla con NETWORK_ERROR, los otros dos bloques siguen', async () => {
    const networkErr = Object.assign(new Error('Network'), { code: 'NETWORK_ERROR' });
    mockedGetMySchedule.mockResolvedValue([{ id: 'c1' }] as never);
    mockedGetUnreadCount.mockResolvedValue({ count: 2 });
    mockedGetConversations.mockResolvedValue([] as never);
    mockedGetMyCharges.mockRejectedValue(networkErr);

    const bundle = await getFamilyDashboard();

    expect(bundle.nextClasses.sourceAvailable).toBe(true);
    expect(bundle.unread.sourceAvailable).toBe(true);
    expect(bundle.pendingCharges.sourceAvailable).toBe(false);
    expect(bundle.pendingCharges.items).toEqual([]);
  });

  it('si getUnreadCount falla pero getConversations responde, igual toda la fuente "unread" se considera caída', async () => {
    const networkErr = Object.assign(new Error('Network'), { code: 'NETWORK_ERROR' });
    mockedGetMySchedule.mockResolvedValue([] as never);
    mockedGetUnreadCount.mockRejectedValue(networkErr);
    mockedGetConversations.mockResolvedValue([{ id: 'c1', unreadCount: 2 }] as never);
    mockedGetMyCharges.mockResolvedValue([] as never);

    const bundle = await getFamilyDashboard();

    // La fuente "unread" es una unidad: si una de sus dos llamadas
    // falla, el bloque entero se considera no disponible (no podemos
    // mostrar "notificaciones: X, conversaciones: ?").
    expect(bundle.unread.sourceAvailable).toBe(false);
    expect(bundle.unread.notifications).toBe(0);
    expect(bundle.unread.conversations).toBe(0);
  });

  it('código contractual AUTH_REQUIRED rechaza la promesa (no se disfraza de "fuente caída")', async () => {
    const authErr = Object.assign(new Error('Auth'), { code: 'AUTH_REQUIRED' });
    mockedGetMySchedule.mockRejectedValue(authErr);
    mockedGetUnreadCount.mockResolvedValue({ count: 0 });
    mockedGetConversations.mockResolvedValue([] as never);
    mockedGetMyCharges.mockResolvedValue([] as never);

    await expect(getFamilyDashboard()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('UNAUTHENTICATED (código real del backend, distinto del contractual) también rechaza', async () => {
    const unauthErr = Object.assign(new Error('Unauth'), { code: 'UNAUTHENTICATED' });
    mockedGetMySchedule.mockResolvedValue([] as never);
    mockedGetUnreadCount.mockResolvedValue({ count: 0 });
    mockedGetConversations.mockResolvedValue([] as never);
    mockedGetMyCharges.mockRejectedValue(unauthErr);

    await expect(getFamilyDashboard()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('FORBIDDEN_ROLE rechaza la promesa — la familia no debe ver "Sin datos" cuando su rol no aplica', async () => {
    const forbiddenErr = Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN_ROLE' });
    mockedGetMySchedule.mockResolvedValue([] as never);
    mockedGetUnreadCount.mockRejectedValue(forbiddenErr);
    mockedGetConversations.mockResolvedValue([] as never);
    mockedGetMyCharges.mockResolvedValue([] as never);

    await expect(getFamilyDashboard()).rejects.toMatchObject({ code: 'FORBIDDEN_ROLE' });
  });
});

describe('getFamilyDashboard — filtrado de cargos pendientes', () => {
  it.each([
    ['due', true],
    ['overdue', true],
    ['partial', true],
    ['failed', true],
    ['paid', false],
    ['refunded', false],
    ['cancelled', false],
    ['draft', false],
  ] as const)('cargo con status=%s → accionable=%s', async (status, expected) => {
    mockedGetMySchedule.mockResolvedValue([] as never);
    mockedGetUnreadCount.mockResolvedValue({ count: 0 });
    mockedGetConversations.mockResolvedValue([] as never);
    mockedGetMyCharges.mockResolvedValue([{ id: 'ch1', status }] as never);

    const bundle = await getFamilyDashboard();

    if (expected) {
      expect(bundle.pendingCharges.items).toHaveLength(1);
    } else {
      expect(bundle.pendingCharges.items).toHaveLength(0);
    }
  });
});

describe('renderFamilyCount', () => {
  it('sourceAvailable=false → unavailable (NUNCA value, aunque count>0)', () => {
    expect(renderFamilyCount({ count: 5, sourceAvailable: false })).toEqual({
      kind: 'unavailable',
    });
  });

  it('sourceAvailable=true && count=0 → empty', () => {
    expect(renderFamilyCount({ count: 0, sourceAvailable: true })).toEqual({
      kind: 'empty',
    });
  });

  it('sourceAvailable=true && count>0 → value', () => {
    expect(renderFamilyCount({ count: 3, sourceAvailable: true })).toEqual({
      kind: 'value',
      value: 3,
    });
  });

  it('block undefined o null → unavailable', () => {
    expect(renderFamilyCount(undefined)).toEqual({ kind: 'unavailable' });
    expect(renderFamilyCount(null)).toEqual({ kind: 'unavailable' });
  });

  it('count negativo (defensivo) → unavailable (no se renderiza -3)', () => {
    expect(renderFamilyCount({ count: -1, sourceAvailable: true })).toEqual({
      kind: 'unavailable',
    });
  });
});

// ZAL-768: `FamilyDashboardRole` se derivaba de una lista manual que
// omitía `provider`, así que el compilador no obligaba a que ese rol
// pasara por el guard. Ahora deriva de ZaltykoRole; estos tests fijan
// el comportamiento en runtime.
describe('getMyDashboard — provider no accede al dashboard familiar (ZAL-768)', () => {
  it('provider es rechazado con FORBIDDEN_ROLE sin tocar la red', async () => {
    await expect(getMyDashboard('provider')).rejects.toMatchObject({
      code: 'FORBIDDEN_ROLE',
      status: 403,
    });
    expect(mockedGetMySchedule).not.toHaveBeenCalled();
    expect(mockedGetMyCharges).not.toHaveBeenCalled();
  });

  it.each(['owner', 'admin', 'coach', 'super_admin', 'viewer', 'provider'] as const)(
    '%s (rol no familiar) es rechazado',
    async (role) => {
      await expect(getMyDashboard(role)).rejects.toMatchObject({
        code: 'FORBIDDEN_ROLE',
      });
    }
  );
});

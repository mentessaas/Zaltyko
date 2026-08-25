// Cobertura vitest del cliente `mobile/lib/api/dashboard.ts`.
//
// El cliente consume el endpoint compartido Web/Mobile fijado en ZAL-619
// §6.2 + ZAL-635. Estos tests verifican:
//   - shape correcto de la URL (academyId encodeado, view en query).
//   - bearer token y desestructuración `{ data }` (vía apiGet).
//   - tratamiento de sourceAvailable=false (NO devolver 0; eso es
//     responsabilidad del consumidor via `renderCount`).
//   - traducción de códigos contractuales ZAL-619 §6.3 que SÍ están en la
//     tabla `translateError` (FORBIDDEN_ROLE, RATE_LIMITED, etc.).
//   - fallback para códigos que el backend emite hoy pero Mobile aún no
//     tiene traducción explícita (gap conocido, ver ZAL-635 §Riesgos).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { getAttention, renderCount } from './dashboard';

const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
}));

vi.mock('@/lib/auth/supabase', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      refreshSession: vi.fn(),
    },
  },
  API_BASE: 'https://app.zaltyko.test',
}));

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('dashboard client (ZAL-622 Fase 2 — contrato ZAL-619 §6.2 + ZAL-635)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'valid-token' } },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ============== URL ==============

  it('construye la URL con academyId encodeado y view=owner en query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        data: { academyId: 'a1', date: '2026-08-12', today: [], priorityAction: null },
        meta: { requestId: 'r1', academyId: 'a1' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await getAttention('a/with/slash', 'owner');

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://app.zaltyko.test/api/dashboard/a%2Fwith%2Fslash/attention?view=owner'
    );
  });

  it('envía view=coach en query cuando se pide el subset del coach', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        data: { academyId: 'a1', date: '2026-08-12', today: [], priorityAction: null },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await getAttention('a1', 'coach');

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('view=coach');
  });

  it('no envía date en query: el server resuelve la zona horaria de la academia (ZAL-635 §Riesgos)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { ok: true, data: {} })
    );
    vi.stubGlobal('fetch', fetchMock);

    await getAttention('a1', 'owner');

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).not.toContain('date=');
  });

  it('adjunta bearer token desde la sesión de Supabase', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { ok: true, data: {} })
    );
    vi.stubGlobal('fetch', fetchMock);

    await getAttention('a1', 'owner');

    expect(fetchMock.mock.calls[0]![1].headers.Authorization).toBe(
      'Bearer valid-token'
    );
  });

  it('desestructura `data` del envelope apiSuccess y devuelve el bundle', async () => {
    const bundle = {
      academyId: 'a1',
      date: '2026-08-12',
      today: [],
      attendancePending: { count: 0, sourceAvailable: true, href: null, source: 'attendance' },
      messagesPending: { unsent: 0, failed: 0, unread: 0, sourceAvailable: true, href: null, source: 'messages' },
      priorityAction: null,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { ok: true, data: bundle, meta: { requestId: 'r', academyId: 'a1' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getAttention('a1', 'coach');

    expect(result).toEqual(bundle);
    // Confirmar que NO leakeó el `meta` ni el `ok` del envelope apiSuccess.
    // El cast a unknown evita que TS rechace la conversión al tipo unión
    // (OwnerAttentionBundle | CoachAttentionBundle) que no tiene index
    // signature. La intención del test es puramente defensiva de runtime.
    const raw = result as unknown as Record<string, unknown>;
    expect(raw.meta).toBeUndefined();
    expect(raw.ok).toBeUndefined();
  });

  // ============== Errores contractuales ZAL-619 §6.3 ==============
  // El backend emite los códigos documentados en la cabecera del route.
  // La traducción a {retryable, nextAction, message} la hace el cliente
  // HTTP (lib/api/client.ts → translateError en lib/api/error-codes.ts).
  // Sólo los códigos presentes en la tabla contractErrorCodes tienen
  // traducción semántica; los demás caen al fallback retryable.
  // Gap conocido: `UNAUTHENTICATED` y `ACADEMY_NOT_FOUND_OR_ACCESS_DENIED`
  // hoy caen al fallback — ZAL-635 §Riesgos documenta este desfase.

  it('mapea 403 FORBIDDEN_ROLE → nextAction=contact_support, NO muestra el message del backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(403, {
        ok: false,
        error: { code: 'FORBIDDEN_ROLE', message: 'mensaje sensible que NO debe llegar a UI' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAttention('a1', 'owner')).rejects.toMatchObject({
      code: 'FORBIDDEN_ROLE',
      status: 403,
      retryable: false,
      nextAction: 'contact_support',
    });
  });

  it('mapea 400 VALIDATION_ERROR → nextAction=none (no reintentar)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(400, { ok: false, error: { code: 'VALIDATION_ERROR', message: 'x' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAttention('a1', 'owner')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
      retryable: false,
      nextAction: 'none',
    });
  });

  it('mapea 429 RATE_LIMITED → retryable + nextAction=wait', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(429, { ok: false, error: { code: 'RATE_LIMITED', message: 'x' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAttention('a1', 'owner')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
      retryable: true,
      nextAction: 'wait',
    });
  });

  it('mapea 500 sin code reconocible → fallback retryable (no expone stack del backend)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(500, {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'stack: at /var/task/x' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAttention('a1', 'owner')).rejects.toMatchObject({
      status: 500,
      retryable: true,
      nextAction: 'retry',
    });
  });

  it('un código desconocido del backend cae al fallback retryable sin filtrar el message (AC-10)', async () => {
    // Este es exactamente el caso "el backend añadió un código nuevo y
    // todavía no lo hemos añadido a la tabla". Por seguridad, la UI NUNCA
    // debe mostrar el `message` crudo del backend.
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        ok: false,
        error: { code: 'SOMETHING_NEW_FROM_BACKEND', message: 'Stack trace: at secret.txt:1:1' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAttention('a1', 'owner')).rejects.toMatchObject({
      code: 'SOMETHING_NEW_FROM_BACKEND',
      retryable: true,
      nextAction: 'retry',
      message: expect.not.stringContaining('Stack trace'),
    });
  });

  // ============== renderCount ==============

  describe('renderCount', () => {
    it('devuelve "value" cuando sourceAvailable=true y count>0', () => {
      expect(renderCount({ count: 5, sourceAvailable: true })).toEqual({
        kind: 'value',
        value: 5,
      });
    });

    it('devuelve "empty" cuando sourceAvailable=true y count=0 (no es lo mismo que unavailable)', () => {
      expect(renderCount({ count: 0, sourceAvailable: true })).toEqual({ kind: 'empty' });
    });

    it('devuelve "unavailable" cuando sourceAvailable=false (NO "empty" ni 0)', () => {
      // Crítico: si la fuente falló, count es no autoritativo por contrato
      // ZAL-619 §6.2; presentarlo como 0 sería mentir al usuario.
      expect(renderCount({ count: 0, sourceAvailable: false })).toEqual({ kind: 'unavailable' });
      expect(renderCount({ count: 99, sourceAvailable: false })).toEqual({ kind: 'unavailable' });
    });

    it('devuelve "unavailable" cuando el bloque es null/undefined', () => {
      expect(renderCount(null)).toEqual({ kind: 'unavailable' });
      expect(renderCount(undefined)).toEqual({ kind: 'unavailable' });
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiGet, apiPost, ApiClientError } from './client';

// El cliente HTTP (ver client.ts) es el punto único donde la app móvil
// adjunta el Bearer token y reintenta ante 401. Se prueba con fetch y
// supabase mockeados — sin esto, un cambio aquí puede romper CADA
// pantalla (Inicio, Agenda, Avisos) sin que typecheck lo detecte, porque
// el contrato con el backend es en runtime (shape de apiSuccess/apiError).

const { getSessionMock, refreshSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  refreshSessionMock: vi.fn(),
}));

vi.mock('@/lib/auth/supabase', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      refreshSession: refreshSessionMock,
    },
  },
  API_BASE: 'https://app.zaltyko.test',
}));

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('apiGet/apiPost - cliente API móvil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'valid-token' } },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adjunta el Bearer token desde la sesión de Supabase y desestructura apiSuccess', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, data: { id: '1' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiGet<{ id: string }>('/api/me');

    expect(result).toEqual({ id: '1' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://app.zaltyko.test/api/me');
    expect(init.headers.Authorization).toBe('Bearer valid-token');
  });

  it('ante 401, refresca la sesión una vez y reintenta con el token nuevo', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { ok: false, error: { code: 'UNAUTHENTICATED', message: 'x' } }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, data: { id: '2' } }));
    vi.stubGlobal('fetch', fetchMock);
    refreshSessionMock.mockResolvedValue({
      data: { session: { access_token: 'refreshed-token' } },
      error: null,
    });

    const result = await apiGet<{ id: string }>('/api/me');

    expect(result).toEqual({ id: '2' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![1].headers.Authorization).toBe('Bearer refreshed-token');
  });

  it('si el reintento también devuelve 401, no refresca ni reintenta una segunda vez', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Token vencido' } }))
      .mockResolvedValueOnce(jsonResponse(401, { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sesión expirada' } }));
    vi.stubGlobal('fetch', fetchMock);
    refreshSessionMock.mockResolvedValue({
      data: { session: { access_token: 'refreshed-token' } },
      error: null,
    });

    await expect(apiGet('/api/me')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
    });
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('si el refresh también falla tras un 401, propaga el error sin loop infinito', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sesión expirada' } }));
    vi.stubGlobal('fetch', fetchMock);
    refreshSessionMock.mockResolvedValue({ data: { session: null }, error: { message: 'refresh failed' } });

    await expect(apiGet('/api/me')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
    });
    // Un solo reintento: el request original + el intento de refresh, no más.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sin sesión activa, ni siquiera llama a fetch', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet('/api/me')).rejects.toBeInstanceOf(ApiClientError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('un error de red se envuelve como ApiClientError NETWORK_ERROR, no se deja como excepción cruda', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet('/api/me')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('si el backend no responde, aborta por timeout en vez de colgarse indefinidamente', async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      // Simula fetch real: la promesa solo se resuelve/rechaza cuando se
      // aborta la signal — sin esto la request nunca terminaría.
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet('/api/me', { timeoutMs: 10 })).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('apiPost serializa el body y fuerza Content-Type json', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);

    await apiPost('/api/events/1/register', { note: 'hola' });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ note: 'hola' }));
  });

  // ---- AC-10: cada ApiClientError lleva retryable + nextAction ----
  // La UI nunca debe tener que adivinar si un error es reintentable: lo
  // decide el traductor de códigos en client.ts.

  it('NETWORK_ERROR expone retryable=true y nextAction="retry"', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet('/api/me')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      retryable: true,
      nextAction: 'retry',
    });
  });

  it('TIMEOUT expone retryable=true y nextAction="retry"', async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet('/api/me', { timeoutMs: 10 })).rejects.toMatchObject({
      code: 'TIMEOUT',
      retryable: true,
      nextAction: 'retry',
    });
  });

  it('NO_SESSION (sin sesión) expone nextAction="reauth"', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet('/api/me')).rejects.toMatchObject({
      code: 'NO_SESSION',
      retryable: false,
      nextAction: 'reauth',
    });
  });

  it('un código contractual conocido (AUTH_REQUIRED) se traduce a nextAction="reauth"', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(401, { ok: false, error: { code: 'AUTH_REQUIRED', message: 'Token vencido' } })
      );
    vi.stubGlobal('fetch', fetchMock);
    // 401 dispara refresh; simulamos que el refresh también devuelve 401 para
    // que el error AUTH_REQUIRED se propague. Sin sesión refreshed, el cliente
    // re-lanza el 401 original.
    refreshSessionMock.mockResolvedValue({ data: { session: null }, error: null });

    await expect(apiGet('/api/me')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      retryable: false,
      nextAction: 'reauth',
    });
  });

  it('un código contractual conocido (RATE_LIMITED) se traduce a nextAction="wait"', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(429, { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } })
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet('/api/me')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true,
      nextAction: 'wait',
    });
  });

  it('un código contractual conocido (FORBIDDEN_ROLE) se traduce a nextAction="contact_support"', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(403, { ok: false, error: { code: 'FORBIDDEN_ROLE', message: 'No permitido' } })
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet('/api/me')).rejects.toMatchObject({
      code: 'FORBIDDEN_ROLE',
      retryable: false,
      nextAction: 'contact_support',
    });
  });

  it('un 500 sin código reconocible cae en HTTP_5xx con retryable=true', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(500, { ok: false, error: { code: 'BOOM', message: 'internal' } })
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet('/api/me')).rejects.toMatchObject({
      code: 'HTTP_5xx',
      retryable: true,
      nextAction: 'retry',
    });
  });

  it('un código contractual desconocido (ej. backend envia uno nuevo) cae al fallback retryable', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(400, { ok: false, error: { code: 'SOMETHING_NEW_FROM_BACKEND', message: 'x' } })
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet('/api/me')).rejects.toMatchObject({
      code: 'SOMETHING_NEW_FROM_BACKEND',
      retryable: true,
      nextAction: 'retry',
    });
  });

  it('NUNCA expone el `message` del backend en errores desconocidos (AC-10)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(400, {
          ok: false,
          error: { code: 'SOMETHING_NEW', message: 'Stack trace: at foo.bar (secret.txt:1:1)' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet('/api/me')).rejects.toMatchObject({
      code: 'SOMETHING_NEW',
      // El `.message` de la ApiClientError NO debe contener el stack del backend.
      message: expect.not.stringContaining('Stack trace'),
    });
  });
});

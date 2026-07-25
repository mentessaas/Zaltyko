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

  it('apiPost serializa el body y fuerza Content-Type json', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);

    await apiPost('/api/events/1/register', { note: 'hola' });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ note: 'hola' }));
  });
});

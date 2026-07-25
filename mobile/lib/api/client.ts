// Cliente HTTP para hablar con la API de Zaltyko.
//
// Contrato:
//   - Todas las respuestas exitosas vienen envueltas en apiSuccess():
//     { ok: true, data: T, meta?: { total, page, pageSize } }
//   - Errores vienen como { ok: false, error: { code, message } }
//   - Bearer token = access JWT de Supabase (mismo que valida withBearerTenant)
//   - Ante 401, intenta refresh UNA vez y repite. Si vuelve a fallar, propagar.

import { supabase, API_BASE } from '@/lib/auth/supabase';

export interface ApiError {
  code: string;
  message: string;
  status: number;
}

export class ApiClientError extends Error {
  code: string;
  status: number;
  constructor(err: ApiError) {
    super(err.message);
    this.code = err.code;
    this.status = err.status;
    this.name = 'ApiClientError';
  }
}

interface RequestOpts {
  token?: string | null;
  body?: unknown;
  headers?: Record<string, string>;
  // Si true y la API devuelve 401, intenta refresh una vez.
  retryOnAuthError?: boolean;
  signal?: AbortSignal;
}

async function getFreshToken(): Promise<string | null> {
  // getSession lee de SecureStore; refresca el access token si está vencido.
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  opts: RequestOpts = {}
): Promise<T> {
  const base = API_BASE.replace(/\/$/, '');
  const url = `${base}${path}`;

  const token = opts.token ?? (await getFreshToken());
  if (!token) {
    throw new ApiClientError({
      code: 'NO_SESSION',
      message: 'No hay sesión activa. Vuelve a iniciar sesión.',
      status: 0,
    });
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...(opts.headers ?? {}),
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const init: RequestInit = {
    method,
    headers,
    ...(opts.signal ? { signal: opts.signal } : {}),
  };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new ApiClientError({
      code: 'NETWORK_ERROR',
      message: err instanceof Error ? err.message : 'Error de red',
      status: 0,
    });
  }

  // 401 → refrescar una vez y reintentar
  if (res.status === 401 && opts.retryOnAuthError !== false) {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session) {
      return request<T>(method, path, {
        ...opts,
        token: data.session.access_token,
        retryOnAuthError: false,
      });
    }
  }

  // Parsear body. La API puede responder 204 sin body.
  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { ok: false, error: { code: 'INVALID_JSON', message: text } };
    }
  }

  if (!res.ok) {
    const errBody = payload as { error?: { code?: string; message?: string } } | null;
    throw new ApiClientError({
      code: errBody?.error?.code ?? `HTTP_${res.status}`,
      message: errBody?.error?.message ?? res.statusText,
      status: res.status,
    });
  }

  // apiSuccess shape: { ok: true, data }
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }

  return payload as T;
}

export const apiGet = <T>(path: string, opts: RequestOpts = {}) =>
  request<T>('GET', path, opts);
export const apiPost = <T>(path: string, body?: unknown, opts: RequestOpts = {}) =>
  request<T>('POST', path, { ...opts, body });
export const apiPatch = <T>(path: string, body?: unknown, opts: RequestOpts = {}) =>
  request<T>('PATCH', path, { ...opts, body });
export const apiPut = <T>(path: string, body?: unknown, opts: RequestOpts = {}) =>
  request<T>('PUT', path, { ...opts, body });
export const apiDelete = <T>(path: string, opts: RequestOpts = {}) =>
  request<T>('DELETE', path, opts);

// URL base para construir links que redirigen a la web (pagos, settings).
export const webBaseUrl = (): string => API_BASE;
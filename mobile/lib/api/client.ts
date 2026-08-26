// Cliente HTTP para hablar con la API de Zaltyko.
//
// Contrato:
//   - Todas las respuestas exitosas vienen envueltas en apiSuccess():
//     { ok: true, data: T, meta?: { total, page, pageSize } }
//   - Errores vienen como { ok: false, error: { code, message } }
//   - Bearer token = access JWT de Supabase (mismo que valida withBearerTenant)
//   - Ante 401, intenta refresh UNA vez y repite. Si vuelve a fallar, propagar.
<<<<<<< HEAD
//   - Los errores se traducen al set mínimo del contrato ZAL-619 §6.3
//     (ver ./error-codes.ts): nunca exponemos el `message` del backend
//     cuando el código es desconocido (AC-10: sin stack trace ni secretos).

import { supabase, API_BASE } from '@/lib/auth/supabase';
import {
  translateError,
  inferRetryableFromStatus,
  isKnownErrorCode,
  type NextAction,
} from './error-codes';

export interface ApiError {
  code: string;
  /** Copy localized seguro para UI; viene de translateError(), NO del backend. */
  message: string;
  status: number;
  /** Si la operación puede reintentarse con expectativa de éxito. */
  retryable: boolean;
  /** Acción que la UI debería ofrecer. */
  nextAction: NextAction;
=======

import { supabase, API_BASE } from '@/lib/auth/supabase';

export interface ApiError {
  code: string;
  message: string;
  status: number;
>>>>>>> origin/main
}

export class ApiClientError extends Error {
  code: string;
  status: number;
<<<<<<< HEAD
  retryable: boolean;
  nextAction: NextAction;
=======
>>>>>>> origin/main
  constructor(err: ApiError) {
    super(err.message);
    this.code = err.code;
    this.status = err.status;
<<<<<<< HEAD
    this.retryable = err.retryable;
    this.nextAction = err.nextAction;
=======
>>>>>>> origin/main
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
  // Endpoints públicos (ej. preview de invitación) no requieren sesión.
  // Si hay una sesión igual se manda, por si el endpoint la usa opcionalmente.
  requireAuth?: boolean;
  // Sin esto una request se queda colgada indefinidamente si el backend
  // no responde (visto en carne propia con el dev server sobrecargado).
  timeoutMs?: number;
<<<<<<< HEAD
  // ZAL-619 §6.2 + AC-09: clave de idempotencia para mutaciones. Cuando
  // el backend la implemente, devolverá el mismo resultado lógico ante
  // reintentos con la misma clave, o `IDEMPOTENCY_CONFLICT` ante payload
  // distinto con la misma clave. Mientras tanto, el upsert SQL es
  // naturalmente idempotente y la app sólo persiste la clave para que
  // un reintento por error de red no genere una nueva cada vez.
  idempotencyKey?: string;
=======
>>>>>>> origin/main
}

const DEFAULT_TIMEOUT_MS = 20_000;

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
  if (!token && opts.requireAuth !== false) {
<<<<<<< HEAD
    const t = translateError('NO_SESSION');
    throw new ApiClientError({
      code: 'NO_SESSION',
      message: t.message,
      status: 0,
      retryable: t.retryable,
      nextAction: t.nextAction,
=======
    throw new ApiClientError({
      code: 'NO_SESSION',
      message: 'No hay sesión activa. Vuelve a iniciar sesión.',
      status: 0,
>>>>>>> origin/main
    });
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
<<<<<<< HEAD
    ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
=======
>>>>>>> origin/main
    ...(opts.headers ?? {}),
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  // AbortController propio para el timeout; si además el caller pasó su
  // propio signal, cancelamos el nuestro cuando el suyo se dispare.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onExternalAbort);

  const init: RequestInit = {
    method,
    headers,
    signal: controller.signal,
  };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
<<<<<<< HEAD
    const code = timedOut ? 'TIMEOUT' : 'NETWORK_ERROR';
    const t = translateError(code);
    throw new ApiClientError({
      code,
      message: t.message,
      status: 0,
      retryable: t.retryable,
      nextAction: t.nextAction,
=======
    throw new ApiClientError({
      code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: timedOut
        ? 'La solicitud tardó demasiado. Revisa tu conexión e inténtalo de nuevo.'
        : err instanceof Error
          ? err.message
          : 'Error de red',
      status: 0,
>>>>>>> origin/main
    });
  } finally {
    clearTimeout(timeoutId);
    opts.signal?.removeEventListener('abort', onExternalAbort);
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
<<<<<<< HEAD
      // Si el body no es JSON, marcarlo pero seguir con el status.
      // Esto NO se filtra a la UI: translateError() decide qué copy mostrar.
      const t = translateError('INVALID_JSON');
      throw new ApiClientError({
        code: 'INVALID_JSON',
        message: t.message,
        status: res.status,
        retryable: t.retryable,
        nextAction: t.nextAction,
      });
=======
      payload = { ok: false, error: { code: 'INVALID_JSON', message: text } };
>>>>>>> origin/main
    }
  }

  if (!res.ok) {
    const errBody = payload as { error?: { code?: string; message?: string } } | null;
<<<<<<< HEAD
    const rawCode = errBody?.error?.code;
    // Regla asimétrica por contrato:
    // - 5xx + código desconocido → HTTP_5xx (el bucket es accionable y
    //   estable; el código crudo del backend se considera ruido de soporte).
    // - 4xx + código desconocido → conservamos el código crudo para que
    //   logs/soporte lo identifiquen, pero el `message` mostrado en UI
    //   viene de FALLBACK (translateError), NUNCA del backend.
    // - Cualquier status + código conocido → se respeta tal cual.
    const code = isKnownErrorCode(rawCode)
      ? rawCode!
      : res.status >= 500
        ? 'HTTP_5xx'
        : (rawCode ?? `HTTP_${res.status}`);
    const t = translateError(code);
    throw new ApiClientError({
      code,
      // SIEMPRE copy de la tabla — NUNCA el `message` del backend cuando el
      // código es desconocido (AC-10: nunca exponer stack trace ni secretos).
      message: t.message,
      status: res.status,
      retryable: t.retryable ?? inferRetryableFromStatus(res.status),
      nextAction: t.nextAction,
=======
    throw new ApiClientError({
      code: errBody?.error?.code ?? `HTTP_${res.status}`,
      message: errBody?.error?.message ?? res.statusText,
      status: res.status,
>>>>>>> origin/main
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
<<<<<<< HEAD
export const webBaseUrl = (): string => API_BASE;
=======
export const webBaseUrl = (): string => API_BASE;
>>>>>>> origin/main

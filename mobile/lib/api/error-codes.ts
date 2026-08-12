// Traductor de códigos de error al set mínimo del contrato ZAL-619 §6.3.
//
// AC-10 del contrato: "Cualquier fallo de red/servicio conserva la distinción
// confirmed/pending/failed, ofrece siguiente acción y nunca enseña stack
// trace/secreto." Esta tabla existe para que la UI NUNCA muestre el
// `message` crudo del backend cuando el código es desconocido (porque no
// podemos garantizar que no filtre datos de otra academia, stack trace o
// secretos). Para códigos conocidos, devolvemos copy localizado y
// determinamos `retryable` + `nextAction`.
//
// Los códigos de cliente (NO_SESSION, NETWORK_ERROR, TIMEOUT, INVALID_JSON)
// no vienen del backend sino del propio cliente HTTP; viven aquí para que
// toda la lógica de traducción pase por un único punto.

export type NextAction = 'retry' | 'reauth' | 'contact_support' | 'wait' | 'none';

export interface ErrorTranslation {
  /** Copy localized, seguro para mostrar en UI. NO usar el `message` del backend. */
  message: string;
  /** Si el usuario puede reintentar y esperar un resultado distinto al actual. */
  retryable: boolean;
  /** Acción que la UI debería ofrecer (botón "Reintentar" / "Volver a iniciar sesión" / etc.). */
  nextAction: NextAction;
}

// Códigos contractuales del set mínimo de ZAL-619 §6.3. Usar como string
// union cerrada en tipos públicos (ver ApiClientError.code).
export const CONTRACT_ERROR_CODES = [
  'AUTH_REQUIRED',
  'FORBIDDEN_ROLE',
  'ACADEMY_NOT_FOUND',
  'RESOURCE_NOT_FOUND',
  'VALIDATION_ERROR',
  'INVALID_STATE_TRANSITION',
  'IDEMPOTENCY_CONFLICT',
  'DUPLICATE_SUSPECTED',
  'IMPORT_ROW_INVALID',
  'IMPORT_TOTAL_MISMATCH',
  'PAYMENT_STATE_UNAVAILABLE',
  'DELIVERY_FAILED',
  'RATE_LIMITED',
  'TEMPORARY_UNAVAILABLE',
] as const;

export type ContractErrorCode = (typeof CONTRACT_ERROR_CODES)[number];

// Códigos que produce el propio cliente HTTP (no vienen del backend).
export const CLIENT_ERROR_CODES = [
  'NO_SESSION',
  'NETWORK_ERROR',
  'TIMEOUT',
  'INVALID_JSON',
] as const;

export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];

const TRANSLATIONS: Record<string, ErrorTranslation> = {
  // --- Contrato ZAL-619 §6.3 ---
  AUTH_REQUIRED: {
    message: 'Tu sesión expiró. Vuelve a iniciar sesión para continuar.',
    retryable: false,
    nextAction: 'reauth',
  },
  FORBIDDEN_ROLE: {
    message: 'No tienes permiso para hacer esto.',
    retryable: false,
    nextAction: 'contact_support',
  },
  ACADEMY_NOT_FOUND: {
    message: 'No encontramos esta academia.',
    retryable: false,
    nextAction: 'contact_support',
  },
  RESOURCE_NOT_FOUND: {
    message: 'Este recurso ya no está disponible.',
    retryable: false,
    nextAction: 'none',
  },
  VALIDATION_ERROR: {
    message: 'Revisa los datos e inténtalo de nuevo.',
    retryable: false,
    nextAction: 'none',
  },
  INVALID_STATE_TRANSITION: {
    message: 'Esta acción ya no es válida en el estado actual.',
    retryable: false,
    nextAction: 'none',
  },
  IDEMPOTENCY_CONFLICT: {
    message: 'Otra solicitud idéntica ya se procesó.',
    retryable: false,
    nextAction: 'contact_support',
  },
  DUPLICATE_SUSPECTED: {
    message: 'Detectamos un duplicado. Revisa antes de continuar.',
    retryable: false,
    nextAction: 'none',
  },
  IMPORT_ROW_INVALID: {
    message: 'Algunas filas del archivo no se pudieron procesar.',
    retryable: false,
    nextAction: 'contact_support',
  },
  IMPORT_TOTAL_MISMATCH: {
    message: 'Los totales del archivo no coinciden con lo esperado.',
    retryable: false,
    nextAction: 'contact_support',
  },
  PAYMENT_STATE_UNAVAILABLE: {
    message: 'No podemos consultar este cargo ahora. Inténtalo más tarde.',
    retryable: true,
    nextAction: 'retry',
  },
  DELIVERY_FAILED: {
    message: 'No pudimos enviar el mensaje. Reintenta.',
    retryable: true,
    nextAction: 'retry',
  },
  RATE_LIMITED: {
    message: 'Demasiadas solicitudes. Espera unos segundos.',
    retryable: true,
    nextAction: 'wait',
  },
  TEMPORARY_UNAVAILABLE: {
    message: 'Servicio no disponible. Reintenta en un momento.',
    retryable: true,
    nextAction: 'retry',
  },
  // --- Cliente ---
  NO_SESSION: {
    message: 'No hay sesión activa. Vuelve a iniciar sesión.',
    retryable: false,
    nextAction: 'reauth',
  },
  NETWORK_ERROR: {
    message: 'Sin conexión. Revisa tu red e inténtalo de nuevo.',
    retryable: true,
    nextAction: 'retry',
  },
  TIMEOUT: {
    message: 'La solicitud tardó demasiado. Reintenta.',
    retryable: true,
    nextAction: 'retry',
  },
  INVALID_JSON: {
    message: 'Respuesta inesperada del servidor. Reintenta.',
    retryable: true,
    nextAction: 'retry',
  },
};

const FALLBACK: ErrorTranslation = {
  // Copy genérico para códigos desconocidos: NO se usa `message` del backend
  // porque no podemos garantizar que no filtre datos sensibles (AC-10).
  message: 'Ocurrió un error. Inténtalo de nuevo.',
  retryable: true,
  nextAction: 'retry',
};

/**
 * Indica si un código forma parte del set conocido (contractual o de
 * cliente). Útil para que el cliente HTTP decida cuándo conservar un
 * código crudo del backend y cuándo colapsarlo al bucket HTTP genérico.
 *
 * Por contrato (ver client.ts):
 * - 5xx con código desconocido → HTTP_5xx (el bucket es más accionable que
 *   el código crudo del backend).
 * - 4xx con código desconocido → se conserva el código crudo para que
 *   logs y soporte puedan identificarlo, pero el `message` que ve la UI
 *   viene de FALLBACK (nunca del backend).
 */
export function isKnownErrorCode(code: string | undefined): boolean {
  if (!code) return false;
  return (
    (CONTRACT_ERROR_CODES as readonly string[]).includes(code) ||
    (CLIENT_ERROR_CODES as readonly string[]).includes(code)
  );
}

/**
 * Traduce un código (contractual o de cliente) a copy localizado seguro y
 * a la metadata que la UI necesita para decidir si reintentar, pedir
 * re-auth o derivar a soporte.
 *
 * Si el código no está en la tabla, devuelve un fallback genérico y
 * descarta cualquier `fallbackMessage` del backend: por contrato ZAL-619
 * §6.1 el backend debe enviar mensajes seguros, pero hasta validar
 * exhaustivamente no confiamos en ellos para UI.
 */
export function translateError(code: string): ErrorTranslation {
  return TRANSLATIONS[code] ?? FALLBACK;
}

/**
 * Inferencia de retryable cuando sólo se conoce el status HTTP (caso de
 * errores sin `code` reconocible, p.ej. `HTTP_5xx`). Útil en el cliente
 * HTTP cuando la API devuelve un body sin la forma `{ok,error}` esperada.
 */
export function inferRetryableFromStatus(status: number): boolean {
  // 5xx y 408 (request timeout) y 429 son reintentables. El resto no.
  return status >= 500 || status === 408 || status === 429;
}

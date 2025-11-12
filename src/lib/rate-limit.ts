import { NextRequest, NextResponse } from "next/server";

/**
 * Rate Limiting Middleware
 * 
 * Implementa rate limiting básico usando un Map en memoria.
 * Para producción, considera usar Redis o un servicio dedicado.
 */

interface RateLimitStore {
  count: number;
  resetTime: number;
}

// Store en memoria (se reinicia en cada deploy)
// En producción, usa Redis o un servicio dedicado
const rateLimitStore = new Map<string, RateLimitStore>();

// Configuración por defecto
const DEFAULT_LIMIT = 100; // requests
const DEFAULT_WINDOW = 60 * 1000; // 1 minuto en ms

// Límites específicos por ruta
const ROUTE_LIMITS: Record<string, { limit: number; window: number }> = {
  "/api/super-admin": { limit: 50, window: 60 * 1000 }, // 50 req/min
  "/api/billing/checkout": { limit: 10, window: 60 * 1000 }, // 10 req/min
  "/api/admin/users": { limit: 20, window: 60 * 1000 }, // 20 req/min
  "/api/athletes": { limit: 100, window: 60 * 1000 }, // 100 req/min
};

/**
 * Obtiene el límite para una ruta específica
 */
function getLimitForRoute(pathname: string): { limit: number; window: number } {
  for (const [route, limits] of Object.entries(ROUTE_LIMITS)) {
    if (pathname.startsWith(route)) {
      return limits;
    }
  }
  return { limit: DEFAULT_LIMIT, window: DEFAULT_WINDOW };
}

/**
 * Verifica si una request excede el rate limit
 */
export function checkRateLimit(
  identifier: string,
  pathname: string
): { allowed: boolean; remaining: number; resetTime: number } {
  const { limit, window } = getLimitForRoute(pathname);
  const now = Date.now();
  const key = `${identifier}:${pathname}`;

  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetTime) {
    // Nueva ventana o ventana expirada
    const resetTime = now + window;
    rateLimitStore.set(key, { count: 1, resetTime });
    return { allowed: true, remaining: limit - 1, resetTime };
  }

  if (entry.count >= limit) {
    // Límite excedido
    return { allowed: false, remaining: 0, resetTime: entry.resetTime };
  }

  // Incrementar contador
  entry.count++;
  rateLimitStore.set(key, entry);
  return { allowed: true, remaining: limit - entry.count, resetTime: entry.resetTime };
}

/**
 * Limpia entradas expiradas del store (ejecutar periódicamente)
 */
export function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Middleware wrapper para rate limiting
 */
export function withRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  options?: { identifier?: (request: NextRequest) => string }
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // Limpiar entradas expiradas periódicamente (cada 100 requests aprox)
    if (Math.random() < 0.01) {
      cleanupExpiredEntries();
    }

    // Obtener identificador (IP o user ID)
    const identifier = options?.identifier
      ? options.identifier(request)
      : request.headers.get("x-forwarded-for")?.split(",")[0] ||
        request.headers.get("x-real-ip") ||
        "unknown";

    const pathname = new URL(request.url).pathname;
    const rateLimit = checkRateLimit(identifier, pathname);

    if (!rateLimit.allowed) {
      const resetSeconds = Math.ceil((rateLimit.resetTime - Date.now()) / 1000);
      return NextResponse.json(
        {
          error: "RATE_LIMIT_EXCEEDED",
          message: "Demasiadas requests. Intenta de nuevo más tarde.",
          resetIn: resetSeconds,
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(getLimitForRoute(pathname).limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(rateLimit.resetTime),
            "Retry-After": String(resetSeconds),
          },
        }
      );
    }

    // Ejecutar handler
    const response = await handler(request);

    // Agregar headers de rate limit
    response.headers.set("X-RateLimit-Limit", String(getLimitForRoute(pathname).limit));
    response.headers.set("X-RateLimit-Remaining", String(rateLimit.remaining));
    response.headers.set("X-RateLimit-Reset", String(rateLimit.resetTime));

    return response;
  };
}

/**
 * Helper para obtener user ID desde el request (para rate limiting por usuario)
 */
export function getUserIdentifier(request: NextRequest): string {
  // Intentar obtener user ID del header (si está disponible)
  const userId = request.headers.get("x-user-id");
  if (userId) {
    return `user:${userId}`;
  }

  // Fallback a IP
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}


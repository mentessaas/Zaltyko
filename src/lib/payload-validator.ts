import { NextRequest, NextResponse } from "next/server";

/**
 * Tamaño máximo de payload en bytes
 * Por defecto: 1MB (suficiente para la mayoría de operaciones)
 */
const DEFAULT_MAX_PAYLOAD_SIZE = 1024 * 1024; // 1MB

/**
 * Límites específicos por ruta (en bytes)
 */
const ROUTE_LIMITS: Record<string, number> = {
  "/api/athletes/import": 10 * 1024 * 1024, // 10MB para importación CSV
  "/api/athletes": 512 * 1024, // 512KB para creación de atletas
  "/api/assessments": 512 * 1024, // 512KB para evaluaciones
  "/api/admin/users": 256 * 1024, // 256KB para invitaciones
};

/**
 * Obtiene el límite de tamaño para una ruta específica
 */
function getLimitForRoute(pathname: string): number {
  for (const [route, limit] of Object.entries(ROUTE_LIMITS)) {
    if (pathname.startsWith(route)) {
      return limit;
    }
  }
  return DEFAULT_MAX_PAYLOAD_SIZE;
}

/**
 * Valida el tamaño del payload de una request
 */
export async function validatePayloadSize(
  request: NextRequest,
  maxSize?: number
): Promise<{ valid: boolean; size?: number; maxSize?: number }> {
  const pathname = new URL(request.url).pathname;
  const limit = maxSize ?? getLimitForRoute(pathname);

  // Obtener Content-Length del header
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (!isNaN(size) && size > limit) {
      return {
        valid: false,
        size,
        maxSize: limit,
      };
    }
  }

  // Para métodos POST/PUT/PATCH, también verificar el body si es pequeño
  const method = request.method?.toUpperCase();
  if (["POST", "PUT", "PATCH"].includes(method ?? "")) {
    try {
      // Clonar request para leer el body sin consumirlo
      const clonedRequest = request.clone();
      const body = await clonedRequest.text();
      const size = new Blob([body]).size;

      if (size > limit) {
        return {
          valid: false,
          size,
          maxSize: limit,
        };
      }
    } catch (error) {
      // Si no podemos leer el body, confiar en Content-Length
      // o permitir la request (mejor false positive que false negative)
    }
  }

  return { valid: true };
}

/**
 * Middleware wrapper para validar tamaño de payload
 */
export function withPayloadValidation(
  handler: (request: NextRequest) => Promise<NextResponse>,
  options?: { maxSize?: number }
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const validation = await validatePayloadSize(request, options?.maxSize);

    if (!validation.valid) {
      const sizeMB = ((validation.size ?? 0) / (1024 * 1024)).toFixed(2);
      const maxSizeMB = ((validation.maxSize ?? 0) / (1024 * 1024)).toFixed(2);

      return NextResponse.json(
        {
          error: "PAYLOAD_TOO_LARGE",
          message: `El payload es demasiado grande (${sizeMB}MB). Tamaño máximo permitido: ${maxSizeMB}MB`,
          size: validation.size,
          maxSize: validation.maxSize,
        },
        { status: 413 }
      );
    }

    return handler(request);
  };
}


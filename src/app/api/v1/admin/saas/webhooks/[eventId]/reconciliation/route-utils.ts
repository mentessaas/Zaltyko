import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-response";
import { rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const NO_STORE = { "cache-control": "private, no-store" };
const PUBLIC_RECOVERY_ERRORS: Record<string, { status: number; message: string }> = {
  EVENT_NOT_FOUND: {
    status: 404,
    message: "No se ha encontrado el evento de webhook.",
  },
  PREVIEW_STALE: {
    status: 409,
    message: "La vista previa ha quedado obsoleta. Solicita una nueva.",
  },
  STATE_CHANGED: {
    status: 409,
    message: "El estado ha cambiado. Solicita una nueva vista previa.",
  },
  IDEMPOTENCY_KEY_REUSED: {
    status: 409,
    message: "La clave de idempotencia ya se utilizó con otros datos.",
  },
  RECONCILIATION_NOT_ALLOWED: {
    status: 409,
    message: "El evento no puede reconciliarse en su estado actual.",
  },
  UNSUPPORTED_QUARANTINE: {
    status: 409,
    message: "Este tipo de evento no admite reconciliación.",
  },
  PROVIDER_UNAVAILABLE: {
    status: 503,
    message: "No se pudo verificar la información del proveedor. Inténtalo de nuevo.",
  },
};
const OPERATIONAL_ERROR_FALLBACKS: Record<
  string,
  { code: string; status: number; message: string }
> = {
  "NOT_FOUND:404": {
    code: "EVENT_NOT_FOUND",
    status: 404,
    message: "No se ha encontrado el evento de webhook.",
  },
  "VERSION_CONFLICT:400": {
    code: "VALIDATION_ERROR",
    status: 400,
    message: "Los datos de la operación de reconciliación no son válidos.",
  },
  "VERSION_CONFLICT:409": {
    code: "STATE_CHANGED",
    status: 409,
    message: "El estado o la vista previa han cambiado. Solicita una nueva vista previa.",
  },
  "INVALID_STATE_TRANSITION:409": {
    code: "RECONCILIATION_NOT_ALLOWED",
    status: 409,
    message: "El evento no puede reconciliarse en su estado actual.",
  },
  "IDEMPOTENCY_CONFLICT:409": {
    code: "IDEMPOTENCY_KEY_REUSED",
    status: 409,
    message: "La clave de idempotencia ya se utilizó con otros datos.",
  },
  "UNVERIFIED_PROVIDER_EVENT:409": {
    code: "RECONCILIATION_NOT_ALLOWED",
    status: 409,
    message: "No se ha podido validar la evidencia del evento.",
  },
  "UNVERIFIED_PROVIDER_EVENT:503": {
    code: "PROVIDER_UNAVAILABLE",
    status: 503,
    message: "No se pudo verificar la información del proveedor. Inténtalo de nuevo.",
  },
  "FEATURE_NOT_AVAILABLE:503": {
    code: "RECONCILIATION_UNAVAILABLE",
    status: 503,
    message: "La reconciliación no está disponible en este momento.",
  },
  "PRICE_PLAN_NOT_AVAILABLE:409": {
    code: "UNSUPPORTED_QUARANTINE",
    status: 409,
    message: "Este tipo de evento no admite reconciliación.",
  },
};

export function noStore<T extends NextResponse>(response: T): T {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

export function apiErrorNoStore(code: string, message: string, status: number): NextResponse {
  return noStore(apiError(code, message, status));
}

export async function enforceOperatorRateLimit(
  actorUserId: string,
  action: "preview" | "confirm"
): Promise<NextResponse | null> {
  const result = await rateLimit({
    identifier: `saas-quarantine-reconciliation:${actorUserId}:${action}`,
    limit: 10,
    window: 60,
  });
  return result.success ? null : noStore(rateLimitExceededResponse(result));
}

export function serviceErrorResponse(error: unknown): NextResponse {
  if (error instanceof OperationalError) {
    const detailCode = error.details?.code;
    if (typeof detailCode === "string") {
      const publicError = PUBLIC_RECOVERY_ERRORS[detailCode];
      if (publicError) {
        return apiErrorNoStore(detailCode, publicError.message, publicError.status);
      }
    }

    const operationalFallback = OPERATIONAL_ERROR_FALLBACKS[`${error.code}:${error.status}`];
    if (operationalFallback) {
      return apiErrorNoStore(
        operationalFallback.code,
        operationalFallback.message,
        operationalFallback.status
      );
    }
  }

  return apiErrorNoStore(
    "RECONCILIATION_UNAVAILABLE",
    "No se pudo completar la operación de reconciliación.",
    500
  );
}

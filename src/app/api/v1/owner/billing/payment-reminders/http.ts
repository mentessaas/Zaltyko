import type { NextResponse } from "next/server";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { hasSameOrigin } from "@/modules/saas-billing/application/owner-access";
import { ReminderValidationError } from "@/modules/payment-reminders/application/settings";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export function unauthenticatedResponse() {
  return problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para gestionar los recordatorios de cuotas.",
    type: "authentication-required",
  });
}

export function sameOriginProblem(request: Request): NextResponse | null {
  if (hasSameOrigin(request)) return null;
  return withPrivateNoStore(
    problemResponse({
      status: 403,
      title: "Solicitud no válida",
      detail: "Esta acción solo se puede hacer desde la página de Zaltyko. Recarga la página e inténtalo de nuevo.",
      type: "invalid-origin",
    }) as NextResponse
  );
}

export function invalidRequestResponse(errors: unknown) {
  return problemResponse({
    status: 400,
    title: "Datos del recordatorio incompletos",
    detail: "Revisa la academia, la sede y las cuotas elegidas.",
    type: "invalid-payment-reminder",
    errors,
  });
}

/** Devuelve la respuesta para los errores esperados, o null si hay que relanzar. */
export function reminderErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof ReminderValidationError) {
    return problemResponse({
      status: 422,
      title: "La plantilla necesita cambios",
      detail: error.issues.map((issue) => issue.message).join(" "),
      type: "invalid-payment-reminder-template",
      errors: error.issues,
    });
  }
  if (error instanceof OperationalError) return operationalProblem(error);
  return null;
}

export function withPrivateNoStore<T extends NextResponse>(response: T): T {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

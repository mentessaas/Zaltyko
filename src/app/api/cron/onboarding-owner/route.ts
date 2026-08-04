import { NextResponse } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { runCronWithLease } from "@/lib/cron-lease";
import { logger } from "@/lib/logger";
import {
  processOnboardingOwnerD2,
  processOnboardingOwnerD7,
} from "@/lib/onboarding-owner-integration";

export const dynamic = "force-dynamic";

/**
 * Cron handler para los pasos d2 (+48h) y d7 (+7d) de la secuencia
 * d0/d2/d7 owner (ZAL-314 B1).
 *
 * Vercel cron schedule:
 *   - d2 y d7 se invocan desde el mismo endpoint pasando `?step=d2|d7`.
 *   - vercel.json define dos entradas con la misma ruta y schedules
 *     distintos para minimizar overhead.
 *
 * Tolerancia (documentada en `ONBOARDING_OWNER_THRESHOLDS`):
 *   - d2: target 48h ± 2h
 *   - d7: target 7d ± 6h
 *
 * Idempotencia: `sendEmailWithLogging` chequea `email_logs.idempotency_key`
 * (unique index). Retries seguros aunque el cron se dispare mas de una vez.
 */
async function runStep(step: "d2" | "d7") {
  const handler = step === "d2" ? processOnboardingOwnerD2 : processOnboardingOwnerD7;
  return runCronWithLease(`cron:onboarding-owner:${step}`, () => handler());
}

export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const stepParam = url.searchParams.get("step");
  if (stepParam !== "d2" && stepParam !== "d7") {
    return apiError(
      "INVALID_STEP",
      "Query param `step` debe ser `d2` o `d7`.",
      400
    );
  }

  try {
    const execution = await runStep(stepParam);
    if (!execution.acquired) {
      return apiSuccess({ skipped: true, reason: "ALREADY_RUNNING", step: stepParam });
    }
    return apiSuccess({ step: stepParam, ...execution.value });
  } catch (error) {
    logger.error(`onboarding-owner cron ${stepParam} failed`, error);
    return apiError(
      "ONBOARDING_OWNER_CRON_FAILED",
      `No se pudo procesar la cola ${stepParam}.`,
      500
    );
  }
}

export async function POST(request: Request) {
  // Permitimos POST como fallback manual desde QA (sandbox). Misma
  // autenticacion que GET.
  return GET(request);
}

// Compatibilidad con handlers que esperan NextResponse.
export const _legacy = NextResponse;

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { runCronWithLease } from "@/lib/cron-lease";
import { logger } from "@/lib/logger";
import {
  processOnboardingOwnerD2,
  processOnboardingOwnerD7,
} from "@/lib/onboarding-owner-integration";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;
  const step = new URL(request.url).searchParams.get("step");
  if (step !== "d2" && step !== "d7")
    return apiError("INVALID_STEP", "step debe ser d2 o d7", 400);
  try {
    const execution = await runCronWithLease(
      `cron:onboarding-owner:${step}`,
      step === "d2" ? processOnboardingOwnerD2 : processOnboardingOwnerD7
    );
    return execution.acquired
      ? apiSuccess({ step, ...execution.value })
      : apiSuccess({ step, skipped: true, reason: "ALREADY_RUNNING" });
  } catch (error) {
    logger.error("onboarding-owner cron failed", error, { step });
    return apiError(
      "ONBOARDING_OWNER_CRON_FAILED",
      "No se pudo procesar la secuencia",
      500
    );
  }
}

export const POST = GET;

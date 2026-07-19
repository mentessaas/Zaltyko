import { eq } from "drizzle-orm";

import { db } from "@/db";
import { stripeAccounts } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { collectDueChargesForAcademy } from "@/lib/stripe/charge-collection-service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/collect-charges
 *
 * Cobro automático diario: por cada academia con Stripe Connect habilitado,
 * intenta cobrar con tarjeta los cargos ya vencidos (pending/overdue/failed con
 * dueDate <= hoy) de las familias con tarjeta guardada. Idempotente y con lock
 * por cargo (ver charge-collection-service). Esta es la promesa central del
 * módulo: el dueño no persigue a las familias.
 */
export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  const startedAt = Date.now();

  try {
    logger.info("Collect charges cron started");
    const readyAccounts = await db
      .select({ academyId: stripeAccounts.academyId })
      .from(stripeAccounts)
      .where(eq(stripeAccounts.chargesEnabled, true));

    const totals = {
      academies: 0,
      academyErrors: 0,
      attempted: 0,
      paid: 0,
      failed: 0,
      skipped: 0,
    };

    for (const account of readyAccounts) {
      totals.academies += 1;

      try {
        const summary = await collectDueChargesForAcademy({
          academyId: account.academyId,
          onlyDue: true,
        });
        totals.attempted += summary.attempted;
        totals.paid += summary.paid;
        totals.failed += summary.failed;
        totals.skipped += summary.skipped;
      } catch (error) {
        totals.academyErrors += 1;
        logger.error("Collect charges failed for academy", error, {
          academyId: account.academyId,
        });
      }
    }

    logger.info("Collect charges cron completed", {
      ...totals,
      durationMs: Date.now() - startedAt,
    });
    return apiSuccess(totals);
  } catch (error) {
    logger.error("Collect charges cron failed", error, {
      durationMs: Date.now() - startedAt,
    });
    return apiError("COLLECT_CHARGES_FAILED", "No se pudo ejecutar el cobro automático", 500);
  }
}

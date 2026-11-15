import { apiError, apiSuccess } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { runCronWithLease } from "@/lib/cron-lease";
import { withCronSystemActor } from "@/lib/cron-system-actor";
import { logger } from "@/lib/logger";
import { isFamilyAccessAvailableForPage } from "@/modules/family-access/application/family-access-storage";
import { deliverNoticeEmails } from "@/modules/family-access/application/family-notices";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Reintento de los correos de avisos a familias que quedaron pendientes (cola
 * agotada por tiempo en la petición o fallo del proveedor). Con la bandera
 * apagada o sin el candidato no hace nada. Protegido por CRON_SECRET antes de
 * cualquier trabajo y con lease para no solaparse. Programado una vez al día en
 * vercel.json (plan Hobby; ADR-0016).
 */
export async function POST(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const cron = await withCronSystemActor(request, () =>
      runCronWithLease("cron:family-notices", async () => {
        if (!(await isFamilyAccessAvailableForPage())) return { skipped: true as const, reason: "FEATURE_OFF" };
        return { skipped: false as const, ...(await deliverNoticeEmails({}, { batchSize: 25, budgetMs: 60_000 })) };
      })
    );
    if (!cron.ok) return cron.response;
    const execution = cron.value;
    if (!execution.acquired) return apiSuccess({ skipped: true, reason: "LEASE_HELD" });
    return apiSuccess(execution.value);
  } catch (error) {
    logger.error("Family notice email worker failed", error);
    return apiError("FAMILY_NOTICES_WORKER_FAILED", "No se pudieron procesar los avisos pendientes", 500);
  }
}

// Vercel Cron invoca los paths configurados mediante GET. Mantener POST permite
// disparos operativos explícitos con el mismo contrato de autenticación.
export const GET = POST;

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { runCronWithLease } from "@/lib/cron-lease";
import { logger } from "@/lib/logger";
import {
  deliverFamilyFailureNotices,
  type FamilyFailureNoticeDelivery,
} from "@/modules/family-collection/application/family-failure-notice-delivery";
import {
  FAMILY_COLLECTION_DEADLINE_MS,
  runFamilyCollection,
  type FamilyCollectionRunResult,
} from "@/modules/family-collection/application/family-collection-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// El proceso se corta solo a los 240 s (FAMILY_COLLECTION_DEADLINE_MS).
export const maxDuration = 300;

const NO_STORE = "private, no-store";
/** Tiempo como mucho para los avisos pendientes de otro día, antes de cobrar. */
const EARLY_NOTICES_DEADLINE_MS = 20_000;

/**
 * @route-auth cron
 *
 * Cobro automático de cuotas (Fase 3). Lo lanzará pg_cron una vez al día
 * (06:00 UTC; docs/deployment/scheduler/candidates/collect-family-fees.sql,
 * sin aplicar). Todo lo decide `runFamilyCollection`:
 * - con la clave de Stripe que no es de test, o contra la base de producción,
 *   no hace nada;
 * - sin las tablas del cobro, no hace nada («enabled: false»);
 * - con ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED apagada solo pone al día
 *   los cobros que quedaron a medias (para que lo que ya salió en Stripe quede
 *   registrado) y nunca cobra nada nuevo («enabled: false»);
 * - con la bandera encendida, además cobra lo que vence hoy.
 * Los avisos de primer cobro fallido a las familias (D3) se envían dos veces
 * (deliverFamilyFailureNotices, mismos cerrojos): ANTES de cobrar, los que
 * quedaron pendientes de otro día (así salen antes de que la Fase B reclame
 * el reintento), y al terminar, los de hoy. El cobro tiene el plazo que dejó
 * el primer envío (240 s en total, con 20 s como mucho para ese envío; el
 * segundo, 30 s), por debajo de los 300 s de la ruta. Si un envío falla, el
 * cobro no se ve afectado («familyNotices: null» si fallan los dos).
 * Sin el secreto no se toca nada (401, o 503 si falta CRON_SECRET).
 * La respuesta solo lleva contadores: nunca ids, importes ni datos de familias.
 */
export async function POST(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const execution = await runCronWithLease("cron:collect-family-fees", async () => {
      const startedAt = Date.now();
      // Primero los avisos pendientes de otro día: antes de la Fase B.
      const early = await deliverNotices(EARLY_NOTICES_DEADLINE_MS);
      const spent = Math.max(0, Date.now() - startedAt);
      const run = await runFamilyCollection({ deadlineMs: Math.max(0, FAMILY_COLLECTION_DEADLINE_MS - spent) });
      const late = await deliverNotices();
      return { run, familyNotices: mergeNotices(early, late) };
    });
    if (!execution.acquired || !execution.value) {
      return noStore(apiSuccess({ skipped: true, reason: "ALREADY_RUNNING" }));
    }
    return noStore(
      apiSuccess({
        ...countersOnly(execution.value.run),
        familyNotices: noticeCounters(execution.value.familyNotices),
      })
    );
  } catch (error) {
    if (error instanceof OperationalError && error.code === "FEATURE_NOT_AVAILABLE") {
      return noStore(apiSuccess({ enabled: false, reason: "UNAVAILABLE" }));
    }
    // Solo el nombre y el código: nunca mensajes de Stripe ni de la base.
    logger.error("Error en el cobro automático de cuotas", undefined, {
      errorName: error instanceof Error ? error.name : "unknown",
      errorCode: errorCode(error),
    });
    return noStore(apiError("INTERNAL_ERROR", "Error interno del servidor", 500));
  }
}

// pg_net llama por POST; GET permite el mismo disparo con el mismo contrato de
// autenticación, como en el resto de rutas cron.
export const GET = POST;

/** Avisos a las familias; un fallo aquí no tumba la respuesta del cobro. */
async function deliverNotices(deadlineMs?: number): Promise<FamilyFailureNoticeDelivery | null> {
  try {
    return await deliverFamilyFailureNotices(deadlineMs === undefined ? {} : { deadlineMs });
  } catch (error) {
    // Solo el nombre y el código: nunca mensajes de la base ni del correo.
    logger.error("Error al enviar los avisos de cobro fallido a las familias", undefined, {
      errorName: error instanceof Error ? error.name : "unknown",
      errorCode: errorCode(error),
    });
    return null;
  }
}

/**
 * Suma de los dos envíos. Los pendientes (sin resultado guardado) son los del
 * último envío que funcionó: el segundo vuelve a mirar los del primero.
 */
function mergeNotices(
  early: FamilyFailureNoticeDelivery | null,
  late: FamilyFailureNoticeDelivery | null
): FamilyFailureNoticeDelivery | null {
  if (!early) return late;
  if (!late) return early;
  return { sent: early.sent + late.sent, notSent: early.notSent + late.notSent, pending: late.pending };
}

/** Solo los tres contadores de los avisos. */
function noticeCounters(delivery: FamilyFailureNoticeDelivery | null): FamilyFailureNoticeDelivery | null {
  if (!delivery) return null;
  return { sent: delivery.sent, notSent: delivery.notSent, pending: delivery.pending };
}

/** Copia campo a campo, para que nada que se añada al resultado salga sin revisar. */
function countersOnly(result: FamilyCollectionRunResult): FamilyCollectionRunResult {
  return {
    enabled: result.enabled,
    complete: result.complete,
    reconciled: result.reconciled,
    collected: result.collected,
    processing: result.processing,
    failed: result.failed,
    canceled: result.canceled,
    // Las claves son motivos de omisión (códigos en minúsculas), nunca ids.
    skipped: Object.fromEntries(
      Object.entries(result.skipped).filter(
        ([reason, count]) => /^[a-z0-9_]{1,64}$/.test(reason) && Number.isInteger(count)
      )
    ),
    retried: result.retried,
    resumed: result.resumed,
    needsReview: result.needsReview,
  };
}

function errorCode(error: unknown): string | null {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
  return typeof code === "string" && /^[A-Za-z0-9_]{1,64}$/.test(code) ? code : null;
}

function noStore<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", NO_STORE);
  return response;
}

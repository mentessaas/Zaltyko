/**
 * Gate centralizado de elegibilidad de academia para envío de emails
 * transaccionales soft (d0/d2/d7, marketing pendiente, notificaciones).
 *
 * Contexto: ZAL-328 [D-006/WD→P&S] Modelar status semánticas academy
 * (churned/fraud_hold). Ver ZAL-139 spec v0.2 §6 (gate) y ZAL-315 §3
 * (criterios de seguridad B3, item 4: TODO gate de envío debe usar
 * `isAcademyBlockedFromSending`).
 *
 * Por qué existe esta función:
 *   - El spec v0.2 §6 obliga a saltarse academias en `churned`, `suspended`
 *     o `fraud_hold`.
 *   - El criterio B3 §3.3 #4 exige que TODO gate de envío (no solo d0/d2/d7)
 *     aplique la misma regla. Un helper central evita que cada integrador
 *     re-implementa el WHERE clause y olvide un caso.
 *   - `fraud_hold` es decisión de seguridad. El integrador NUNCA debe poder
 *     limpiarlo automáticamente (criterio §3.3 #6). El gate hace cumplir eso
 *     sin permitir bypass.
 *
 * Defense in depth: la migración SQL `20260805120000_academies_status_semantics.sql`
 * define `public.is_academy_blocked_from_sending(uuid)` con la misma lógica.
 * Cualquier caller SQL (jobs, queries ad-hoc) la evalúa de la misma forma.
 */
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { academies, type AcademyStatus } from "@/db/schema/academies";
import { logger } from "@/lib/logger";

/**
 * Valores de `status` que bloquean el envío de emails transaccionales soft.
 * La lista es SEMÁNTICA: refleja el contrato que el spec v0.2 §6 nombra.
 * NO añadir `trial` aquí: el trial ES elegible para d0/d2/d7 (es justo el
 * target de la secuencia de onboarding).
 */
export const BLOCKED_SENDING_STATUS_VALUES: ReadonlyArray<AcademyStatus> = [
  "suspended",
  "churned",
  "fraud_hold",
];

export type AcademySendingBlockReason =
  | "suspended"
  | "churned"
  | "fraud_hold"
  | "is_suspended_legacy"
  | "not_found";

export interface AcademySendingEligibility {
  /** true ⇔ NO se debe enviar. */
  blocked: boolean;
  /** Motivo principal del bloqueo. `null` si `blocked=false`. */
  reason: AcademySendingBlockReason | null;
  /** status actual de la academia. `null` si no existe. */
  status: AcademyStatus | null;
  /** True si coincide con `fraud_hold`. Útil para auditoría/alertas. */
  isFraudHold: boolean;
}

/**
 * Motivo de bloqueo legible para logs / métricas. NO usar en copy al usuario.
 */
function reasonToMetric(reason: AcademySendingBlockReason): string {
  return `blocked_sending:${reason}`;
}

function shouldBlockStatus(status: AcademyStatus | null): AcademySendingBlockReason | null {
  if (!status) return null;
  if (status === "suspended") return "suspended";
  if (status === "churned") return "churned";
  if (status === "fraud_hold") return "fraud_hold";
  return null;
}

/**
 * Verifica si una academia está bloqueada para envío de emails transaccionales
 * soft. Combina la nueva columna semántica `status` con el flag legacy
 * `is_suspended` durante la transición (defense in depth).
 *
 * - Lectura con `db` (server / BYPASSRLS): NO se evalúa RLS aquí.
 * - Caché: NO se cachea. Status puede cambiar en segundos (super-admin
 *   suspende / libera, o trial expira). El sending cron itera sobre unos
 *   cientos de academias máximo; el costo de un SELECT es despreciable.
 *
 * @param academyId - UUID de la academia.
 * @returns Eligibility snapshot. `blocked=true` ⇔ saltarse el envío.
 */
export async function isAcademyBlockedFromSending(
  academyId: string
): Promise<AcademySendingEligibility> {
  if (!academyId) {
    return {
      blocked: true,
      reason: "not_found",
      status: null,
      isFraudHold: false,
    };
  }

  let status: AcademyStatus | null = null;
  let isSuspended = false;
  try {
    const [row] = await db
      .select({
        status: academies.status,
        isSuspended: academies.isSuspended,
      })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1);

    if (!row) {
      return {
        blocked: true,
        reason: "not_found",
        status: null,
        isFraudHold: false,
      };
    }
    status = (row.status as AcademyStatus) ?? null;
    isSuspended = row.isSuspended ?? false;
  } catch (error) {
    // Falla de DB: bloqueamos por defecto. Per criterio §3.3 #7, un fallo
    // del gate NUNCA debe traducirse en envío accidental.
    logger.error("isAcademyBlockedFromSending query failed", error, {
      academyId,
    });
    return {
      blocked: true,
      reason: "not_found",
      status: null,
      isFraudHold: false,
    };
  }

  // Orden de prioridad: status semántico primero, legacy flag de fallback.
  // Si status='fraud_hold' eso es señal de seguridad absoluta y nunca
  // se sobreescribe con isSuspended.
  const statusReason = shouldBlockStatus(status);
  if (statusReason) {
    return {
      blocked: true,
      reason: statusReason,
      status,
      isFraudHold: status === "fraud_hold",
    };
  }

  if (isSuspended) {
    return {
      blocked: true,
      reason: "is_suspended_legacy",
      status,
      isFraudHold: false,
    };
  }

  return {
    blocked: false,
    reason: null,
    status,
    isFraudHold: false,
  };
}

/**
 * Variante Bulk para uso en crons. Devuelve un Map<academyId, eligibility>.
 * Realiza una sola query (IN clause) por eficiencia.
 */
export async function getAcademySendingEligibilityBulk(
  academyIds: ReadonlyArray<string>
): Promise<Map<string, AcademySendingEligibility>> {
  const result = new Map<string, AcademySendingEligibility>();
  if (academyIds.length === 0) return result;

  for (const id of academyIds) {
    if (typeof id !== "string" || id.trim().length === 0) {
      result.set(id, {
        blocked: true,
        reason: "not_found",
        status: null,
        isFraudHold: false,
      });
    }
  }

  // Mantener el contrato: cada input (incluyendo falsy) tiene su propia
  // entrada en el mapa. Solo NO consultar la DB si no hay IDs utilizables.
  const usableIds = academyIds.filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0
  );

  if (usableIds.length === 0) {
    return result;
  }

  const uniqueIds = Array.from(new Set(usableIds));

  try {
    const rows = await db
      .select({
        id: academies.id,
        status: academies.status,
        isSuspended: academies.isSuspended,
      })
      .from(academies)
      .where(sql`${academies.id} = ANY(${uniqueIds}::uuid[])`);

    const found = new Set<string>();
    for (const row of rows) {
      found.add(row.id);
      const status = (row.status as AcademyStatus) ?? null;
      const isSuspended = row.isSuspended ?? false;
      const statusReason = shouldBlockStatus(status);
      if (statusReason) {
        result.set(row.id, {
          blocked: true,
          reason: statusReason,
          status,
          isFraudHold: status === "fraud_hold",
        });
      } else if (isSuspended) {
        result.set(row.id, {
          blocked: true,
          reason: "is_suspended_legacy",
          status,
          isFraudHold: false,
        });
      } else {
        result.set(row.id, {
          blocked: false,
          reason: null,
          status,
          isFraudHold: false,
        });
      }
    }

    for (const id of uniqueIds) {
      if (!found.has(id)) {
        result.set(id, {
          blocked: true,
          reason: "not_found",
          status: null,
          isFraudHold: false,
        });
      }
    }
  } catch (error) {
    logger.error("getAcademySendingEligibilityBulk query failed", error, {
      inputCount: uniqueIds.length,
    });
    // Falla de DB: bloqueamos todo por defecto (criterio §3.3 #7).
    for (const id of uniqueIds) {
      result.set(id, {
        blocked: true,
        reason: "not_found",
        status: null,
        isFraudHold: false,
      });
    }
  }

  return result;
}

/**
 * Log helper para integrar con sistemas de telemetría. Mantiene un shape
 * estable y no leakea academyId si el log es agregado.
 */
export function describeBlockingReason(
  eligibility: Pick<AcademySendingEligibility, "blocked" | "reason" | "isFraudHold">
): string {
  if (!eligibility.blocked) return "eligible";
  return reasonToMetric(eligibility.reason ?? "not_found");
}

/**
 * Helper predicate para los call sites típicos.
 */
export async function academyMayReceiveOnboardingEmail(
  academyId: string
): Promise<boolean> {
  const eligibility = await isAcademyBlockedFromSending(academyId);
  return !eligibility.blocked;
}

// Re-export del schema enum para importadores downstream.
export { academyStatusValues, type AcademyStatus } from "@/db/schema/academies";

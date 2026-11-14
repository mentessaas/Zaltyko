import { sql } from "drizzle-orm";

import { db } from "@/db";
import { logger } from "@/lib/logger";

import { isUsageMetricsEnabled } from "../domain/flags";
import { isoWeekKey, localDate } from "../domain/local-time";
import {
  familyWeekPseudonym,
  isUsageActorRole,
  isUsageEventName,
  USAGE_PSEUDONYM_SECRET_VARIABLE,
  type UsageActorRole,
  type UsageEventName,
} from "../domain/usage";
import { isUsageStorageAvailableCached } from "./storage";

/** La medición cuenta por día y semana de Madrid, igual en toda la vista de super-admin. */
export const USAGE_TIMEZONE = "Europe/Madrid";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pseudonymSecret(): string | null {
  return process.env[USAGE_PSEUDONYM_SECRET_VARIABLE] ?? null;
}

export interface UsageEventInput {
  organizationId: string;
  eventName: UsageEventName;
  actorRole: UsageActorRole;
  /** Solo para eventos de familia: se convierte en un seudónimo semanal y no se guarda. */
  actorUserId?: string;
  now?: Date;
}

/**
 * Registra un evento de uso. Nunca lanza ni retrasa la acción de negocio: con la
 * bandera apagada, sin tabla instalada o ante cualquier error devuelve `false`.
 * Cuenta una fila por academia, evento, rol y día (y familia-semana en el portal).
 */
export async function recordUsageEvent(input: UsageEventInput): Promise<boolean> {
  try {
    if (!isUsageMetricsEnabled()) return false;
    if (
      !UUID.test(input.organizationId) ||
      !isUsageEventName(input.eventName) ||
      !isUsageActorRole(input.actorRole)
    ) {
      return false;
    }
    const now = input.now ?? new Date();
    let actorRef = "";
    if (input.eventName === "family_portal_view") {
      if (input.actorRole !== "family" || !input.actorUserId) return false;
      const pseudonym = familyWeekPseudonym({
        userId: input.actorUserId,
        weekKey: isoWeekKey(now, USAGE_TIMEZONE),
        secret: pseudonymSecret(),
      });
      // Sin su secreto propio no hay seudónimo: mejor no medir que medir con la cuenta.
      if (!pseudonym) return false;
      actorRef = pseudonym;
    } else if (input.actorRole === "family") {
      return false;
    }
    if (!(await isUsageStorageAvailableCached())) return false;

    await db.execute(sql`
      insert into public.usage_events (organization_id, event_name, actor_role, occurred_on, actor_ref)
      values (
        ${input.organizationId}::uuid, ${input.eventName}, ${input.actorRole},
        ${localDate(now, USAGE_TIMEZONE)}::date, ${actorRef}
      )
      on conflict (organization_id, event_name, actor_role, occurred_on, actor_ref)
      do update set occurrences = public.usage_events.occurrences + 1, updated_at = now()
    `);
    return true;
  } catch (error) {
    logger.warn("habitual_use.usage_event_failed", {
      eventName: input.eventName,
      error: error instanceof Error ? error.message : "unknown",
    });
    return false;
  }
}

/** El equipo de una academia abre Zaltyko (Resumen o Pasar lista). */
export function recordStaffVisit(input: {
  organizationId: string;
  role: string;
  now?: Date;
}): Promise<boolean> {
  if (!isUsageActorRole(input.role) || input.role === "family") return Promise.resolve(false);
  return recordUsageEvent({
    organizationId: input.organizationId,
    eventName: "staff_visit",
    actorRole: input.role,
    now: input.now,
  });
}

/** Una familia entra al portal; una fila por academia y familia-semana. */
export function recordFamilyPortalView(input: {
  organizationId: string;
  userId: string;
  now?: Date;
}): Promise<boolean> {
  return recordUsageEvent({
    organizationId: input.organizationId,
    eventName: "family_portal_view",
    actorRole: "family",
    actorUserId: input.userId,
    now: input.now,
  });
}

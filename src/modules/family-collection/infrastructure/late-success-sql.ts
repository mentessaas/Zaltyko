/**
 * Cobro automático de cuotas (Fase 4): condiciones SQL del cobro tardío en
 * espera (aviso `late_success_pending`). Viven aparte del almacén para que
 * otros módulos (los recordatorios) las usen sin cargar la base ni el resto
 * del almacén: solo dependen de drizzle-orm y de constantes del dominio.
 */
import { sql, type SQL } from "drizzle-orm";

import { AMOUNT_MISMATCH_REASON } from "@/modules/family-collection/domain/payment-outcome";
import {
  DUPLICATE_COLLECTION_REASON,
  LATE_SUCCESS_PENDING_REASON,
} from "@/modules/family-collection/domain/late-success";

/** Evento del outbox con el que la academia recibe un aviso para revisar un cobro. */
export const NEEDS_REVIEW_EVENT = "family_collection.needs_review";

/**
 * Avisos que cierran la espera de un cobro tardío: ya no hay nada más que
 * registrar y lo resuelve la academia.
 */
const LATE_SUCCESS_SETTLED_REASONS = [
  DUPLICATE_COLLECTION_REASON,
  AMOUNT_MISMATCH_REASON,
  "payment_recorded_for_other_attempt",
] as const;

/**
 * Condición SQL «el intento `alias` es un cobro tardío en espera»: `failed` o
 * `canceled` con `pi_…`, con el aviso `late_success_pending` y sin ninguno de
 * los avisos que cierran la espera (LATE_SUCCESS_SETTLED_REASONS). Un tardío
 * ya cobrado deja de cumplirla por su estado. Solo columnas de la Fase 3 y
 * `outbox_events`. El alias es una constante del código, nunca un dato.
 */
export function latePendingAttempt(alias: "a" | "lp"): SQL {
  const table = sql.raw(alias);
  const settledKeys = sql.join(
    LATE_SUCCESS_SETTLED_REASONS.map(
      (reason) => sql`'family-collection:' || ${table}.id::text || ${`:needs_review:${reason}`}`
    ),
    sql`, `
  );
  return sql`${table}.status in ('failed', 'canceled')
    and ${table}.provider_payment_intent_reference is not null
    and exists (
      select 1 from zaltyko.outbox_events e
       where e.organization_id = ${table}.organization_id
         and e.event_name = ${NEEDS_REVIEW_EVENT}
         and e.idempotency_key = 'family-collection:' || ${table}.id::text || ${`:needs_review:${LATE_SUCCESS_PENDING_REASON}`}
    )
    and not exists (
      select 1 from zaltyko.outbox_events e
       where e.organization_id = ${table}.organization_id
         and e.event_name = ${NEEDS_REVIEW_EVENT}
         and e.idempotency_key in (${settledKeys})
    )`;
}

/**
 * N2: ¿tiene la factura un cobro tardío en espera? Su dinero ya se cobró en
 * Stripe aunque todavía no esté en el libro: mientras tanto nunca se reclama
 * otro intento de esa factura (ni el reintento pendiente de un hermano), o se
 * cobraría dos veces. Lo resuelve el paso 4 diario o la academia. Ola final
 * (M-A1): los recordatorios tampoco piden a la familia ese dinero.
 */
export function invoiceHasLatePending(organizationId: SQL, invoiceId: SQL): SQL {
  return sql`exists (
    select 1 from zaltyko.family_collection_attempts lp
     where lp.organization_id = ${organizationId}
       and lp.invoice_id = ${invoiceId}
       and ${latePendingAttempt("lp")}
  )`;
}

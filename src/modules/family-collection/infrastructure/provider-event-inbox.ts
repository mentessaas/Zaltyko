/**
 * Cobro automático de cuotas (Fase 4): buzón de eventos de Stripe en
 * zaltyko.payment_provider_events (`processor = 'stripe'`,
 * `environment = 'sandbox'`). Da la idempotencia por id de evento: el mismo
 * `evt_…` se procesa una sola vez aunque Stripe lo entregue varias veces o a
 * la vez.
 *
 * Cada operación es una sola sentencia, fuera de cualquier transacción: el
 * manejador que va entre reclamar y terminar puede llamar a Stripe, y Stripe
 * nunca va dentro de una transacción.
 *
 * Del evento solo se guarda `{ type, account, objectType, objectId, created }`
 * y su SHA-256: nada de importes, nombres, correos, tarjeta ni IBAN. En
 * `last_error` solo va un código.
 */
import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import {
  providerEventPayload,
  type ConnectedAccountEvent,
  type ProviderEventPayload,
} from "@/modules/family-collection/domain/provider-event";

/** Un evento que lleva más de esto «en curso» se da por abandonado y se vuelve a procesar. */
export const PROVIDER_EVENT_STALE_PROCESSING_MS = 5 * 60 * 1000;

/** Huella SHA-256 (hex) del contenido que se guarda del evento. */
export function providerEventPayloadSha256(payload: ProviderEventPayload): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * `other_organization`: el mismo `evt_…` ya está guardado en otra academia
 * (solo pasa si una cuenta `acct_` cambió de academia). La ruta lo trata como
 * `duplicate` (200) y lo deja en el registro, solo con ids.
 */
export type ProviderEventClaim = "process" | "duplicate" | "in_progress" | "other_organization";

export interface ProviderEventClaimResult {
  claim: ProviderEventClaim;
  inboxId: string;
  /**
   * Número de entrega de la fila al reclamarla. Es el testigo del cierre:
   * `finishProviderEvent` solo cierra si la fila sigue `processing` con este
   * mismo número, así una entrega vieja no pisa el cierre de otra más nueva.
   */
  attempts: number;
}

/**
 * Reclama el evento para procesarlo. Una sola sentencia atómica:
 * - si no existe, lo inserta `processing` → `process`;
 * - si existe `failed` (o `received`), o lleva `processing` más de 5 minutos
 *   (el proceso anterior se cayó a mitad), lo vuelve a poner `processing` →
 *   `process`;
 * - si ya está `processed` → `duplicate` (terminado: no hay nada que hacer);
 * - si otra entrega lo está procesando desde hace menos de 5 minutos →
 *   `in_progress`: la ruta responde 503 para que Stripe lo reenvíe más tarde.
 *   Así, si esa otra entrega se cae a mitad, el reenvío lo recupera en vez de
 *   darlo por hecho (decisión del coordinador, 18-11-2026).
 * La misma fila nunca cambia de academia: si el id ya existe en otra, es
 * `other_organization` (esta academia nunca podrá procesarlo).
 */
export async function claimProviderEvent(input: {
  organizationId: string;
  event: ConnectedAccountEvent;
  now: Date;
}): Promise<ProviderEventClaimResult> {
  const payload = providerEventPayload(input.event);
  const now = input.now.toISOString();
  const staleBefore = new Date(input.now.getTime() - PROVIDER_EVENT_STALE_PROCESSING_MS).toISOString();
  const claimed = await db.execute(sql`
    insert into zaltyko.payment_provider_events as e (
      organization_id, processor, environment, provider_event_id, event_type,
      payload_sha256, payload, signature_verified, status, attempts,
      received_at, created_at, updated_at
    ) values (
      ${input.organizationId}::uuid, 'stripe', 'sandbox'::zaltyko.provider_environment,
      ${input.event.eventId}, ${input.event.type},
      ${providerEventPayloadSha256(payload)}, ${JSON.stringify(payload)}::jsonb, true,
      'processing'::zaltyko.provider_event_status, 1,
      ${now}::timestamptz, ${now}::timestamptz, ${now}::timestamptz
    )
    on conflict (processor, environment, provider_event_id) do update
       set status = 'processing'::zaltyko.provider_event_status,
           attempts = e.attempts + 1,
           last_error = null,
           updated_at = excluded.updated_at
     where e.organization_id = excluded.organization_id
       and (
         e.status in ('received'::zaltyko.provider_event_status, 'failed'::zaltyko.provider_event_status)
         or (e.status = 'processing'::zaltyko.provider_event_status and e.updated_at < ${staleBefore}::timestamptz)
       )
    returning e.id::text as "id", e.attempts as "attempts"
  `);
  const row = claimed.rows[0] as { id?: unknown; attempts?: unknown } | undefined;
  if (typeof row?.id === "string") return { claim: "process", inboxId: row.id, attempts: Number(row.attempts) };

  // No se insertó ni se reclamó: ya está procesado, en curso o es de otra academia.
  const existing = await db.execute(sql`
    select id::text as "id", organization_id::text as "organizationId", status::text as "status",
           attempts as "attempts"
      from zaltyko.payment_provider_events
     where processor = 'stripe'
       and environment = 'sandbox'::zaltyko.provider_environment
       and provider_event_id = ${input.event.eventId}
     limit 1
  `);
  const found = existing.rows[0] as
    | { id?: unknown; organizationId?: unknown; status?: unknown; attempts?: unknown }
    | undefined;
  if (typeof found?.id !== "string") {
    // Solo pasa si alguien borró la fila entre las dos sentencias.
    throw new Error("FAMILY_COLLECTION_EVENT_INBOX_ROW_MISSING");
  }
  const attempts = Number(found.attempts);
  if (found.organizationId !== input.organizationId) {
    return { claim: "other_organization", inboxId: found.id, attempts };
  }
  if (found.status === "processed") return { claim: "duplicate", inboxId: found.id, attempts };
  // `processing` reciente (o una carrera con otra entrega): que Stripe vuelva a intentarlo.
  return { claim: "in_progress", inboxId: found.id, attempts };
}

/**
 * Cierra el evento reclamado: `processed` con su efecto (`effect_type`,
 * `effect_id`) o `failed` con solo un código en `last_error`. Un `failed` se
 * vuelve a procesar en el siguiente reenvío de Stripe.
 *
 * Cercado: solo cierra si la fila sigue `processing` con el `attempts` de su
 * reclamo. Si otra entrega la reclamó después (la primera tardó más de 5
 * minutos), el cierre de la vieja no hace nada y devuelve `false`: manda el
 * cierre de la entrega más nueva.
 *
 * `effectId` tiene que ser un uuid (o `null`): lo valida el que llama
 * (`inboxEffectId`), porque un id con otro formato haría fallar el cierre
 * después de aplicado el efecto.
 */
export async function finishProviderEvent(input: {
  inboxId: string;
  /** El `attempts` que devolvió `claimProviderEvent` para esta entrega. */
  attempts: number;
  status: "processed" | "failed";
  effectType: string | null;
  effectId: string | null;
  errorCode: string | null;
  /** Por defecto, la hora de la base. */
  now?: Date;
}): Promise<boolean> {
  const now = input.now ? input.now.toISOString() : null;
  const processed = input.status === "processed";
  const closed = await db.execute(sql`
    update zaltyko.payment_provider_events
       set status = ${input.status}::zaltyko.provider_event_status,
           effect_type = ${input.effectType},
           effect_id = ${input.effectId}::uuid,
           last_error = ${processed ? null : input.errorCode},
           processed_at = case when ${processed}::boolean then coalesce(${now}::timestamptz, now()) else null end,
           updated_at = coalesce(${now}::timestamptz, now())
     where id = ${input.inboxId}::uuid
       and processor = 'stripe'
       and status = 'processing'::zaltyko.provider_event_status
       and attempts = ${input.attempts}
    returning id
  `);
  return closed.rows.length > 0;
}

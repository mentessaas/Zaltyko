/**
 * Cobro automático de cuotas (Fase 3): acceso a la base del aviso a la
 * familia en el primer fallo (D3).
 *
 * El aviso nace en el outbox, en la misma transacción que el fallo del
 * intento 1 o su cierre porque la tarjeta ya no está en Stripe
 * (family-collection-store.ts, applyOutcome): evento
 * `family_collection.family_failure_notice`, solo con ids. El trabajador del
 * outbox (zaltyko-outbox) no está programado y solo consume métricas, así que
 * el correo lo envía el propio proceso diario del cobro al terminar
 * (deliverFamilyFailureNotices): lee aquí los avisos sin resultado y, tras
 * intentar el envío, deja un segundo evento con el resultado
 * (`family_collection.family_failure_notice_result`, uno por intento). Los dos
 * eventos solo llevan ids y un código de resultado.
 *
 * Coste: `outbox_events` no tiene índice por evento ni por fecha (solo
 * `(status, available_at)`, el de frescura y el único (organización, evento,
 * clave)), así que la lectura NO recorre el outbox: parte de los intentos 1
 * fallidos recientes (índice `(status, updated_at)` de la candidata) y busca
 * cada aviso y su resultado por el único del outbox.
 *
 * Toca tablas de las candidatas de las Fases 1–3: usar solo después de
 * comprobar que existen. Nada de Stripe aquí.
 */
import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  FAMILY_FAILURE_NOTICE_EVENT,
  FAMILY_FAILURE_NOTICE_RESULT_EVENT,
  familyFailureNoticeResultKey,
} from "@/modules/family-collection/domain/family-failure-notice";
import { appendOutboxEvent, findOutboxEvent } from "@/modules/shared/infrastructure/transactional-records";

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;

/**
 * Resultado del aviso:
 * - `sent`: el proveedor de correo aceptó el envío;
 * - `no_email`: la persona que paga no tiene correo guardado;
 * - `not_delivered`: el envío no se aceptó (baja de correos, envío simulado…);
 * - `invoice_closed`: la cuota ya está pagada o anulada;
 * - `superseded`: el aviso ya no vale (hubo otro intento, el reintento ya pasó
 *   o el intento cambió);
 * - `organization_inactive`: la academia no está activa.
 */
export type FamilyFailureNoticeOutcome =
  | "sent"
  | "no_email"
  | "not_delivered"
  | "invoice_closed"
  | "superseded"
  | "organization_inactive";

/** Aviso pendiente de enviar, con lo necesario para decidir y escribir el correo. */
export interface PendingFamilyFailureNotice {
  organizationId: string;
  locationId: string;
  attemptId: string;
  invoiceId: string;
  attemptNumber: number;
  attemptStatus: string;
  paymentMethodKind: string | null;
  failureCode: string | null;
  declineCode: string | null;
  nextRetryAt: Date | null;
  /** Número del último intento de la factura. */
  lastAttemptNumber: number;
  invoiceStatus: string;
  organizationStatus: string;
  academyName: string;
  timezone: string;
  /** Primer día del periodo más antiguo de las cuotas del intento (YYYY-MM-DD). */
  servicePeriodStart: string | null;
  /** Correo de la persona que paga (mismo criterio que los recordatorios de pago). */
  payerEmail: string | null;
  /** Correo de respuesta de la academia (ajustes de recordatorios), si lo hay. */
  replyToEmail: string | null;
  /**
   * Motivos de la puerta del cobro que ya se conocen al enviar el aviso y que
   * cancelarán el reintento (el correo no debe prometerlo). Sin indicar, no se
   * sabe (la tabla no está): no cuenta.
   * - `reminderSent`: ya salió (o está saliendo) un recordatorio de pago de
   *   alguna cuota abierta de la factura (`reminder_sent`, misma regla que
   *   readReminderSent del almacén del cobro);
   * - `preferenceAutomatic`: la familia sigue en cobro automático (falso si la
   *   academia la pasó a mano: `preference_manual`);
   * - `hasActiveAuthorization`: la persona que paga la factura sigue teniendo
   *   un método de pago activo en la cuenta de test de la academia.
   */
  reminderSent?: boolean;
  preferenceAutomatic?: boolean;
  hasActiveAuthorization?: boolean;
}

export interface FamilyFailureNoticeStore {
  listPending(input: {
    /** Solo avisos desde este instante: uno más antiguo ya no se envía. */
    since: Date;
    limit: number;
    /** Solo tests de PostgreSQL: academias a las que se limita; null = todas. */
    scope: readonly string[] | null;
  }): Promise<PendingFamilyFailureNotice[]>;
  /** Deja el resultado (una vez por intento). `false` si ya estaba. */
  recordResult(input: {
    organizationId: string;
    locationId: string;
    attemptId: string;
    invoiceId: string;
    outcome: FamilyFailureNoticeOutcome;
    now: Date;
  }): Promise<boolean>;
}

function inScope(column: SQL, scope: readonly string[] | null): SQL {
  if (scope === null) return sql`true`;
  // Lista como texto: Drizzle expandiría un array en una lista de parámetros.
  return sql`${column} = any(string_to_array(${scope.join(",")}, ',')::uuid[])`;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function createFamilyFailureNoticeStore(): FamilyFailureNoticeStore {
  return {
    async listPending(input) {
      if (input.scope !== null && input.scope.length === 0) return [];
      // El correo de respuesta de la academia vive en los ajustes de los
      // recordatorios de pago, que pueden no estar instalados; igual los
      // recordatorios, y las tablas de la preferencia y de los métodos de pago
      // se comprueban antes de leerlas.
      const tables = await db.execute(sql`
        select to_regclass('zaltyko.payment_reminder_settings') is not null as "replyTo",
               to_regclass('zaltyko.payment_reminders') is not null as "reminders",
               to_regclass('zaltyko.family_collection_preferences') is not null as "preferences",
               (
                 to_regclass('zaltyko.family_payment_authorizations') is not null
                 and to_regclass('zaltyko.organization_payment_provider_accounts') is not null
               ) as "authorizations"
      `);
      const present = (tables.rows[0] ?? {}) as Record<string, unknown>;
      const hasReplyTo = present.replyTo === true;
      const replyToColumn = hasReplyTo ? sql`prs.reply_to_email` : sql`null::text`;
      const replyToJoin = hasReplyTo
        ? sql`left join zaltyko.payment_reminder_settings prs on prs.organization_id = a.organization_id`
        : sql``;
      // Sin la tabla de recordatorios no pudo salir ninguno.
      const reminderSentColumn =
        present.reminders === true
          ? sql`exists (
              select 1
                from zaltyko.payment_reminders r
                join zaltyko.charges c
                  on c.organization_id = r.organization_id and c.id = r.charge_id
               where r.organization_id = i.organization_id
                 and c.invoice_id = i.id
                 and c.status::text in ('due', 'partially_paid')
                 and r.status::text in ('sent', 'pending')
            )`
          : sql`false`;
      const preferenceColumn =
        present.preferences === true
          ? sql`coalesce((
              select fcp.requested_mode::text = 'automatic'
                from zaltyko.family_collection_preferences fcp
               where fcp.organization_id = i.organization_id and fcp.family_id = i.family_id
               limit 1
            ), false)`
          : sql`null::boolean`;
      const authorizationColumn =
        present.authorizations === true
          ? sql`exists (
              select 1
                from zaltyko.family_payment_authorizations au
                join zaltyko.organization_payment_provider_accounts acc
                  on acc.organization_id = au.organization_id
                 and acc.id = au.payment_provider_account_id
               where au.organization_id = i.organization_id
                 and au.family_id = i.family_id
                 and au.family_payer_id = i.family_payer_id
                 and au.status = 'active'::zaltyko.payment_authorization_status
                 and acc.processor = 'stripe'
                 and acc.environment = 'test'::zaltyko.stripe_environment
            )`
          : sql`null::boolean`;

      const result = await db.execute(sql`
        select a.organization_id::text as "organizationId",
               a.location_id::text as "locationId",
               a.id::text as "attemptId",
               a.invoice_id::text as "invoiceId",
               a.attempt_number as "attemptNumber",
               a.status::text as "attemptStatus",
               a.payment_method_kind::text as "paymentMethodKind",
               a.failure_code as "failureCode",
               a.decline_code as "declineCode",
               to_char(a.next_retry_at at time zone 'UTC', ${sql.raw(ISO)}) as "nextRetryAt",
               (
                 select max(x.attempt_number)
                   from zaltyko.family_collection_attempts x
                  where x.organization_id = a.organization_id and x.invoice_id = a.invoice_id
               ) as "lastAttemptNumber",
               i.status::text as "invoiceStatus",
               o.status::text as "organizationStatus",
               o.name as "academyName",
               coalesce(l.timezone, o.default_timezone) as "timezone",
               (
                 select to_char(min(c.service_period_start), 'YYYY-MM-DD')
                   from zaltyko.family_collection_attempt_charges ac
                   join zaltyko.charges c
                     on c.organization_id = ac.organization_id and c.id = ac.charge_id
                  where ac.organization_id = a.organization_id and ac.attempt_id = a.id
               ) as "servicePeriodStart",
               contact.value as "payerEmail",
               ${replyToColumn} as "replyToEmail",
               ${reminderSentColumn} as "reminderSent",
               ${preferenceColumn} as "preferenceAutomatic",
               ${authorizationColumn} as "hasActiveAuthorization"
          from zaltyko.family_collection_attempts a
          -- Búsqueda exacta por el único (organización, evento, clave) del outbox.
          join zaltyko.outbox_events e
            on e.organization_id = a.organization_id
           and e.event_name = ${FAMILY_FAILURE_NOTICE_EVENT}
           and e.idempotency_key = 'family-collection:' || a.id::text || ':family_failure_notice'
          join zaltyko.invoices i
            on i.organization_id = a.organization_id and i.id = a.invoice_id
          join zaltyko.organizations o on o.id = a.organization_id
          left join zaltyko.locations l
            on l.organization_id = a.organization_id and l.id = a.location_id
          left join zaltyko.family_payers fp
            on fp.organization_id = i.organization_id
           and fp.family_id = i.family_id
           and fp.id = coalesce(a.family_payer_id, i.family_payer_id)
          left join zaltyko.guardians g
            on g.organization_id = fp.organization_id and g.id = fp.guardian_id and g.is_active
          left join lateral (
            select gc.normalized_value as value
              from zaltyko.guardian_contacts gc
             where gc.organization_id = g.organization_id
               and gc.guardian_id = g.id
               and gc.kind = 'email'
             order by gc.is_primary desc, (gc.verified_at is not null) desc, gc.created_at asc, gc.id asc
             limit 1
          ) contact on true
          ${replyToJoin}
         -- Intentos 1 fallidos (o cerrados porque la tarjeta ya no está en
         -- Stripe) de los últimos días (índice family_collection_attempts_resume_idx
         -- (status, updated_at): el cierre deja updated_at en su instante; un
         -- cambio posterior solo lo acerca). Solo salen los que tienen aviso.
         where a.status in ('failed', 'canceled')
           and a.updated_at >= ${input.since.toISOString()}::timestamptz
           and a.attempt_number = 1
           and e.occurred_at >= ${input.since.toISOString()}::timestamptz
           and ${inScope(sql.raw("a.organization_id"), input.scope)}
           and not exists (
             select 1
               from zaltyko.outbox_events r
              where r.organization_id = e.organization_id
                and r.event_name = ${FAMILY_FAILURE_NOTICE_RESULT_EVENT}
                and r.idempotency_key = 'family-collection:' || a.id::text || ':family_failure_notice_result'
           )
         order by e.occurred_at asc, a.id asc
         limit ${input.limit}
      `);
      return (result.rows as Array<Record<string, unknown>>).map((row) => ({
        organizationId: String(row.organizationId),
        locationId: String(row.locationId),
        attemptId: String(row.attemptId),
        invoiceId: String(row.invoiceId),
        attemptNumber: Number(row.attemptNumber),
        attemptStatus: String(row.attemptStatus),
        paymentMethodKind: textOrNull(row.paymentMethodKind),
        failureCode: textOrNull(row.failureCode),
        declineCode: textOrNull(row.declineCode),
        nextRetryAt: textOrNull(row.nextRetryAt) ? new Date(String(row.nextRetryAt)) : null,
        lastAttemptNumber: Number(row.lastAttemptNumber ?? row.attemptNumber),
        invoiceStatus: String(row.invoiceStatus),
        organizationStatus: String(row.organizationStatus),
        academyName: String(row.academyName ?? ""),
        timezone: String(row.timezone ?? "Europe/Madrid"),
        servicePeriodStart: textOrNull(row.servicePeriodStart),
        payerEmail: textOrNull(row.payerEmail),
        replyToEmail: textOrNull(row.replyToEmail),
        reminderSent: row.reminderSent === true,
        ...(typeof row.preferenceAutomatic === "boolean" ? { preferenceAutomatic: row.preferenceAutomatic } : {}),
        ...(typeof row.hasActiveAuthorization === "boolean"
          ? { hasActiveAuthorization: row.hasActiveAuthorization }
          : {}),
      }));
    },

    async recordResult(input) {
      return db.transaction(async (tx) => {
        const eventName = FAMILY_FAILURE_NOTICE_RESULT_EVENT;
        const idempotencyKey = familyFailureNoticeResultKey(input.attemptId);
        if (await findOutboxEvent(tx, { organizationId: input.organizationId, eventName, idempotencyKey })) {
          return false;
        }
        await appendOutboxEvent(tx, {
          organizationId: input.organizationId,
          locationId: input.locationId,
          eventName,
          aggregateType: "family_collection_attempt",
          aggregateId: input.attemptId,
          idempotencyKey,
          // Solo ids y el código del resultado: nunca el correo ni el nombre.
          payload: { attemptId: input.attemptId, invoiceId: input.invoiceId, outcome: input.outcome },
          occurredAt: input.now,
        });
        return true;
      });
    },
  };
}

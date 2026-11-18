/**
 * Cobro automático de cuotas (Fase 4, Tarea 9): acceso a la base del
 * justificante de pago para la familia (D6).
 *
 * El justificante nace en el outbox, en la misma transacción que registra el
 * cobro (family-collection-store.ts, recordCollectedPayment), solo con la
 * bandera ZALTYKO_FAMILY_COLLECTION_RECEIPTS_ENABLED: evento
 * `family_collection.receipt`, solo con ids. El correo lo envía el proceso
 * diario (deliverFamilyReceipts), que deja un segundo evento con el resultado
 * (`family_collection.receipt_result`, uno por intento, solo ids y un código).
 *
 * Todo lo que enseña el justificante se lee del libro: el pago (importe, día),
 * su reparto entre cuotas (o, si el reparto no cuadra con el pago, las cuotas
 * del intento), el periodo de cada cuota y la gimnasta de su matrícula.
 *
 * Coste: como el aviso de primer fallo (family-failure-notice-store.ts), la
 * lectura de pendientes parte de los intentos cobrados recientes (índice
 * `(status, updated_at)`) y busca el justificante y su resultado por el único
 * (organización, evento, clave) del outbox.
 *
 * Toca tablas de las candidatas de las Fases 1–3: usar solo después de
 * comprobar que existen. Nada de Stripe aquí.
 */
import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  FAMILY_RECEIPT_EVENT,
  FAMILY_RECEIPT_RESULT_EVENT,
  familyReceiptFeeLabel,
  familyReceiptResultKey,
  type FamilyReceiptFee,
  type FamilyReceiptView,
} from "@/modules/family-collection/domain/family-receipt";
import { localCalendarDate } from "@/modules/family-collection/domain/collection-plan";
import { familyCanViewFees } from "@/modules/family-portal/application/family-portal-sql";
import { appendOutboxEvent, findOutboxEvent } from "@/modules/shared/infrastructure/transactional-records";

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;

/**
 * Resultado del envío del justificante:
 * - `sent`: el proveedor de correo aceptó el envío;
 * - `no_email`: la persona que paga no tiene correo guardado (la página
 *   sigue disponible en el portal);
 * - `not_delivered`: el envío no se aceptó (baja de correos, envío simulado…);
 * - `superseded`: el cobro ya no se puede enseñar como cobrado (el intento ya
 *   no está cobrado o su pago no se puede leer);
 * - `organization_inactive`: la academia está suspendida o cerrada.
 */
export type FamilyReceiptOutcome = "sent" | "no_email" | "not_delivered" | "superseded" | "organization_inactive";

/** Justificante pendiente de enviar: solo ids y lo necesario para el envío. */
export interface PendingFamilyReceipt {
  organizationId: string;
  locationId: string;
  attemptId: string;
  invoiceId: string;
  organizationStatus: string;
  /** Correo de la persona que paga (mismo criterio que los avisos y recordatorios). */
  payerEmail: string | null;
  /** Correo de respuesta de la academia (ajustes de recordatorios), si lo hay. */
  replyToEmail: string | null;
  /** Instante del justificante en el outbox (ISO con microsegundos), para paginar. */
  occurredAt?: string;
}

export interface FamilyReceiptStore {
  listPending(input: {
    since: Date;
    limit: number;
    /** Solo tests de PostgreSQL: academias a las que se limita; null = todas. */
    scope: readonly string[] | null;
    after?: { occurredAt: string; attemptId: string } | null;
  }): Promise<PendingFamilyReceipt[]>;
  /**
   * El justificante de un intento cobrado que tiene su evento de
   * justificante. Con `viewerUserId`, solo si esa cuenta es la persona que
   * paga esa factura y sigue viendo las cuotas de la familia en el portal;
   * si no, null (nunca se distingue «no existe» de «no es tuyo»).
   */
  readReceipt(input: {
    organizationId: string;
    attemptId: string;
    viewerUserId?: string;
    now: Date;
    /**
     * Tarea M (punto 13): mirar también si el pago tiene una disputa abierta
     * (solo con la forma "phase4", que tiene la tabla de disputas).
     */
    withDisputes?: boolean;
  }): Promise<FamilyReceiptView | null>;
  /**
   * Por factura, el intento cuyo justificante puede abrir `viewerUserId`
   * (persona que paga esa factura y con su evento de justificante).
   */
  listReceiptLinks(input: {
    organizationId: string;
    familyIds: readonly string[];
    invoiceIds: readonly string[];
    viewerUserId: string;
    now: Date;
  }): Promise<Record<string, string>>;
  /** Deja el resultado (una vez por intento). `false` si ya estaba. */
  recordResult(input: {
    organizationId: string;
    locationId: string;
    attemptId: string;
    invoiceId: string;
    outcome: FamilyReceiptOutcome;
    now: Date;
  }): Promise<boolean>;
}

function inScope(column: SQL, scope: readonly string[] | null): SQL {
  if (scope === null) return sql`true`;
  // Lista como texto: Drizzle expandiría un array en una lista de parámetros.
  return sql`${column} = any(string_to_array(${scope.join(",")}, ',')::uuid[])`;
}

function uuidArray(ids: readonly string[]): SQL {
  return sql`string_to_array(${ids.join(",")}, ',')::uuid[]`;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function cents(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value ?? Number.NaN);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

/** El justificante del intento existe en el outbox (solo con la bandera encendida al cobrar). */
function receiptExists(attemptRef: SQL): SQL {
  return sql`exists (
    select 1
      from zaltyko.outbox_events re
     where re.organization_id = a.organization_id
       and re.event_name = ${FAMILY_RECEIPT_EVENT}
       and re.idempotency_key = 'family-collection:' || ${attemptRef}::text || ':receipt'
  )`;
}

/**
 * La cuenta `userId` es la persona que paga esta factura (la del intento o,
 * si no la guardó, la de la factura) y sigue viendo las cuotas de la familia
 * en el portal (cadena canónica familyCanViewFees). Necesita los alias `a`
 * (intento) e `i` (factura).
 */
function viewerIsPayer(userId: string, now: Date): SQL {
  return sql`exists (
    select 1
      from zaltyko.family_payers vp
      join zaltyko.guardians vg
        on vg.organization_id = vp.organization_id and vg.id = vp.guardian_id
     where vp.organization_id = i.organization_id
       and vp.family_id = i.family_id
       and vp.id = coalesce(a.family_payer_id, i.family_payer_id)
       and vg.auth_user_id = ${userId}::uuid
       and vg.is_active
  ) and ${familyCanViewFees({ userId, now, organizationRef: sql`i.organization_id`, familyRef: sql`i.family_id` })}`;
}

export function createFamilyReceiptStore(): FamilyReceiptStore {
  return {
    async listPending(input) {
      if (input.scope !== null && input.scope.length === 0) return [];
      const tables = await db.execute(sql`
        select to_regclass('zaltyko.payment_reminder_settings') is not null as "replyTo"
      `);
      const hasReplyTo = (tables.rows[0] as Record<string, unknown> | undefined)?.replyTo === true;
      const replyToColumn = hasReplyTo ? sql`prs.reply_to_email` : sql`null::text`;
      const replyToJoin = hasReplyTo
        ? sql`left join zaltyko.payment_reminder_settings prs on prs.organization_id = a.organization_id`
        : sql``;
      const afterCondition = input.after
        ? sql`and (e.occurred_at, a.id) > (${input.after.occurredAt}::timestamptz, ${input.after.attemptId}::uuid)`
        : sql``;
      const since = input.since.toISOString();
      const result = await db.execute(sql`
        select a.organization_id::text as "organizationId",
               a.location_id::text as "locationId",
               a.id::text as "attemptId",
               a.invoice_id::text as "invoiceId",
               o.status::text as "organizationStatus",
               contact.value as "payerEmail",
               ${replyToColumn} as "replyToEmail",
               to_char(e.occurred_at at time zone 'UTC', ${sql.raw(ISO)}) as "occurredAt"
          from zaltyko.family_collection_attempts a
          -- Búsqueda exacta por el único (organización, evento, clave) del outbox.
          join zaltyko.outbox_events e
            on e.organization_id = a.organization_id
           and e.event_name = ${FAMILY_RECEIPT_EVENT}
           and e.idempotency_key = 'family-collection:' || a.id::text || ':receipt'
          join zaltyko.invoices i
            on i.organization_id = a.organization_id and i.id = a.invoice_id
          join zaltyko.organizations o on o.id = a.organization_id
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
         -- Intentos cobrados de los últimos días (índice (status, updated_at)).
         where a.status = 'succeeded'
           and a.updated_at >= ${since}::timestamptz
           and e.occurred_at >= ${since}::timestamptz
           and ${inScope(sql.raw("a.organization_id"), input.scope)}
           ${afterCondition}
           and not exists (
             select 1
               from zaltyko.outbox_events r
              where r.organization_id = e.organization_id
                and r.event_name = ${FAMILY_RECEIPT_RESULT_EVENT}
                and r.idempotency_key = 'family-collection:' || a.id::text || ':receipt_result'
           )
         order by e.occurred_at asc, a.id asc
         limit ${input.limit}
      `);
      return (result.rows as Array<Record<string, unknown>>).map((row) => ({
        organizationId: String(row.organizationId),
        locationId: String(row.locationId),
        attemptId: String(row.attemptId),
        invoiceId: String(row.invoiceId),
        organizationStatus: String(row.organizationStatus),
        payerEmail: textOrNull(row.payerEmail),
        replyToEmail: textOrNull(row.replyToEmail),
        ...(textOrNull(row.occurredAt) ? { occurredAt: String(row.occurredAt) } : {}),
      }));
    },

    async readReceipt(input) {
      const viewer = input.viewerUserId ? sql`and ${viewerIsPayer(input.viewerUserId, input.now)}` : sql``;
      // Tarea M (punto 13): devolución anotada (la última) y disputa abierta.
      const openDispute = input.withDisputes
        ? sql`exists (
            select 1
              from zaltyko.family_collection_disputes d
             where d.organization_id = a.organization_id
               and d.attempt_id = a.id
               and d.closed_at is null
               and d.reversed_at is null
          )`
        : sql`false`;
      const header = await db.execute(sql`
        select a.payment_method_kind::text as "method",
               to_char((
                 select max(r.refunded_at)
                   from zaltyko.refunds r
                  where r.organization_id = a.organization_id
                    and r.payment_id = a.payment_id
                    and r.status = 'succeeded'
               ) at time zone 'UTC', ${sql.raw(ISO)}) as "refundedAt",
               (
                 select coalesce(sum(r.amount_cents), 0)
                   from zaltyko.refunds r
                  where r.organization_id = a.organization_id
                    and r.payment_id = a.payment_id
                    and r.status = 'succeeded'
               )::text as "refundedCents",
               ${openDispute} as "underBankReview",
               a.payment_id::text as "paymentId",
               i.reference as "reference",
               o.name as "academyName",
               coalesce(l.timezone, o.default_timezone) as "timezone",
               p.amount_cents as "totalCents",
               p.currency as "currency",
               to_char(p.received_at at time zone 'UTC', ${sql.raw(ISO)}) as "receivedAt",
               nullif(btrim(concat_ws(' ', pp.given_name, pp.family_name)), '') as "payerName"
          from zaltyko.family_collection_attempts a
          join zaltyko.invoices i
            on i.organization_id = a.organization_id and i.id = a.invoice_id
          join zaltyko.organizations o on o.id = a.organization_id
          join zaltyko.payments p
            on p.organization_id = a.organization_id and p.id = a.payment_id
          left join zaltyko.locations l
            on l.organization_id = a.organization_id and l.id = a.location_id
          left join zaltyko.family_payers fp
            on fp.organization_id = i.organization_id
           and fp.family_id = i.family_id
           and fp.id = coalesce(a.family_payer_id, i.family_payer_id)
          left join zaltyko.guardians g
            on g.organization_id = fp.organization_id and g.id = fp.guardian_id
          left join zaltyko.people pp
            on pp.organization_id = g.organization_id and pp.id = g.person_id
         where a.organization_id = ${input.organizationId}::uuid
           and a.id = ${input.attemptId}::uuid
           and a.status = 'succeeded'
           and ${receiptExists(sql`a.id`)}
           ${viewer}
      `);
      const row = header.rows[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      const methodText = textOrNull(row.method);
      const method = methodText === "card" || methodText === "sepa_debit" ? methodText : null;
      const totalCents = cents(row.totalCents);
      const receivedAt = textOrNull(row.receivedAt);
      const paymentId = textOrNull(row.paymentId);
      if (!method || totalCents === null || row.currency !== "EUR" || !receivedAt || !paymentId) return null;
      let collectedOnLocal: string;
      let refundedOnLocal: string | null = null;
      try {
        const timezone = String(row.timezone ?? "Europe/Madrid");
        collectedOnLocal = localCalendarDate(receivedAt, timezone);
        const refundedAt = textOrNull(row.refundedAt);
        if (refundedAt) refundedOnLocal = localCalendarDate(refundedAt, timezone);
      } catch {
        return null;
      }

      // Cuotas: el reparto del pago si cuadra con él; si no (reparto
      // pendiente de revisión), las cuotas del intento, que suman lo cobrado.
      const athleteName = sql`(
        select nullif(btrim(coalesce(ap.preferred_name, ap.given_name)), '')
          from zaltyko.enrollments en
          join zaltyko.athletes ath
            on ath.organization_id = en.organization_id and ath.id = en.athlete_id
          join zaltyko.people ap
            on ap.organization_id = ath.organization_id and ap.id = ath.person_id
         where en.organization_id = c.organization_id and en.id = c.enrollment_id
      )`;
      const fees = await db.execute(sql`
        select 'allocation' as "source",
               to_char(c.service_period_start, 'YYYY-MM-DD') as "periodStart",
               x.amount_cents as "amountCents",
               ${athleteName} as "athleteName"
          from (
            select pa.charge_id, sum(pa.amount_cents) as amount_cents
              from zaltyko.payment_allocations pa
             where pa.organization_id = ${input.organizationId}::uuid
               and pa.payment_id = ${paymentId}::uuid
             group by pa.charge_id
          ) x
          join zaltyko.charges c
            on c.organization_id = ${input.organizationId}::uuid and c.id = x.charge_id
        union all
        select 'attempt' as "source",
               to_char(c.service_period_start, 'YYYY-MM-DD') as "periodStart",
               ac.amount_cents as "amountCents",
               ${athleteName} as "athleteName"
          from zaltyko.family_collection_attempt_charges ac
          join zaltyko.charges c
            on c.organization_id = ac.organization_id and c.id = ac.charge_id
         where ac.organization_id = ${input.organizationId}::uuid
           and ac.attempt_id = ${input.attemptId}::uuid
         order by 1, 2, 4
      `);
      const rows = fees.rows as Array<Record<string, unknown>>;
      const toFees = (source: string): FamilyReceiptFee[] | null => {
        const list: FamilyReceiptFee[] = [];
        for (const fee of rows.filter((candidate) => candidate.source === source)) {
          const amountCents = cents(fee.amountCents);
          if (amountCents === null) return null;
          list.push({
            label: familyReceiptFeeLabel(textOrNull(fee.periodStart)),
            athleteName: textOrNull(fee.athleteName),
            amountCents,
          });
        }
        return list;
      };
      const sum = (list: FamilyReceiptFee[]) => list.reduce((total, fee) => total + fee.amountCents, 0);
      const allocated = toFees("allocation");
      const attempted = toFees("attempt");
      const chosen =
        allocated && allocated.length > 0 && sum(allocated) === totalCents
          ? allocated
          : attempted && attempted.length > 0
            ? attempted
            : null;
      if (!chosen) return null;

      return {
        academyName: String(row.academyName ?? ""),
        payerName: textOrNull(row.payerName) ?? "",
        fees: chosen,
        totalCents,
        currency: "EUR",
        collectedOnLocal,
        method,
        reference: String(row.reference ?? ""),
        refundedOnLocal,
        // Ola final (B3): para distinguir una devolución parcial de una total.
        refundedCents: refundedOnLocal ? cents(row.refundedCents) : null,
        underBankReview: row.underBankReview === true,
      };
    },

    async listReceiptLinks(input) {
      if (input.invoiceIds.length === 0 || input.familyIds.length === 0) return {};
      const result = await db.execute(sql`
        select a.invoice_id::text as "invoiceId", a.id::text as "attemptId"
          from zaltyko.family_collection_attempts a
          join zaltyko.invoices i
            on i.organization_id = a.organization_id and i.id = a.invoice_id
         where a.organization_id = ${input.organizationId}::uuid
           and a.invoice_id = any(${uuidArray(input.invoiceIds)})
           and i.family_id = any(${uuidArray(input.familyIds)})
           and a.status = 'succeeded'
           and ${receiptExists(sql`a.id`)}
           and ${viewerIsPayer(input.viewerUserId, input.now)}
      `);
      const links: Record<string, string> = {};
      for (const row of result.rows as Array<Record<string, unknown>>) {
        links[String(row.invoiceId)] = String(row.attemptId);
      }
      return links;
    },

    async recordResult(input) {
      return db.transaction(async (tx) => {
        const eventName = FAMILY_RECEIPT_RESULT_EVENT;
        const idempotencyKey = familyReceiptResultKey(input.attemptId);
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

/**
 * Cobro automático de cuotas (Fase 3): lecturas de las pantallas.
 *
 * Solo servidor (lee la base): los componentes de cliente solo importan sus
 * tipos con `import type`. Nada de aquí escribe, cobra ni llama a Stripe.
 *
 * - Familia (/familia/cuotas): el estado del cobro automático de cada cuota
 *   que paga la cuenta. Cada consulta repite la cadena canónica del portal
 *   (`familyCanViewFees`, ligada al usuario de la sesión) como las demás
 *   lecturas del portal (family-portal-reads.ts).
 * - Academia (/owner/payments): los cobros automáticos del mes, con su estado,
 *   el motivo en palabras sencillas, si necesitan revisión y qué acciones
 *   admite cada uno (las de family-collection-academy-actions.ts).
 * - Academia (/owner/familias): el interruptor «Cobrar automáticamente» de
 *   cada familia, con la misma regla que la preferencia de la Tarea 4
 *   (family-collection-preferences.ts).
 *
 * Con la bandera apagada, fuera de la clave de test, contra la base de
 * producción o sin las tablas de la Fase 3 no se lee nada: la familia no ve
 * ningún estado y la academia nada nuevo. Nunca salen códigos del banco ni de
 * Stripe: los motivos se traducen aquí a frases sencillas.
 */
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { familyCollectionPreferences } from "@/db/zaltyko-schema";
import { isFamilyAutomaticCollectionOpen } from "@/modules/billing/application/charge-collection-mode";
import {
  loadOrganizationPlanState,
  loadPlanChangeRevision,
} from "@/modules/billing/application/plan-state";
import { isPreferenceRevisionCurrent } from "@/modules/billing/domain/collection-eligibility";
import { evaluateAutomaticCollectionPlanEligibility } from "@/modules/billing/domain/plan-eligibility";
import { isFamilyCollectionStorageAvailable } from "@/modules/family-collection/application/storage";
import {
  addLocalDays,
  collectionDate,
  localCalendarDate,
  startOfLocalDay,
} from "@/modules/family-collection/domain/collection-plan";
import { NEEDS_REVIEW_EVENT } from "@/modules/family-collection/infrastructure/family-collection-store";
import { FAMILY_COLLECTION_MAX_RESUMES } from "@/modules/family-collection/infrastructure/family-collection-schema";
import { resolveFamilyPortalAccess } from "@/modules/family-portal/application/family-portal-access";
import { familyCanViewFees } from "@/modules/family-portal/application/family-portal-sql";
import type {
  FamilyAutomaticFeeStatus,
  FamilyAutomaticFeeStatuses,
} from "@/modules/family-portal/domain/family-portal-presentation";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { AUTOMATIC_COLLECTION_REMINDER_GRACE_DAYS } from "@/modules/payment-reminders/domain/reminder-policy";

export type { FamilyAutomaticFeeStatus, FamilyAutomaticFeeStatuses };

const OPEN_STATUSES: ReadonlySet<string> = new Set(["claimed", "created", "processing"]);
const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;
const uuidSchema = z.guid();

/** Lista de uuid como parámetros (`a, b, c`), sin SQL crudo. */
function uuidList(ids: readonly string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `
  );
}

function validIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].filter((id) => uuidSchema.safeParse(id).success);
}

function dateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function dayOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

function cents(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

/** Último intento de cobro de una factura, con lo que necesitan las pantallas. */
export interface LatestAttemptSnapshot {
  status: string;
  nextRetryAt: Date | null;
  completedAt: Date | null;
}

/** Fecha de cobro prevista de la primera cuota automática abierta (día local de la sede). */
function plannedCollectionDate(input: {
  nextDueAt: string | Date | null;
  timezone: string;
  collectionDayOfMonth: number | null;
}): string | null {
  if (!input.nextDueAt) return null;
  return collectionDate({
    dueDateLocal: localCalendarDate(input.nextDueAt, input.timezone),
    collectionDayOfMonth: input.collectionDayOfMonth,
  });
}

// ---------------------------------------------------------------------------
// Familia
// ---------------------------------------------------------------------------

/**
 * Estado del cobro automático de una cuota para la familia, o `null` si la
 * cuota no se cobra sola (o ya se pagó por otra vía). Función pura.
 *
 * - cobrada: «Cobrada automáticamente el {día del cobro}»;
 * - intento en curso (`claimed`, `created`, `processing`): «Cobro en curso»;
 * - fallida con reintento programado: «Se cobrará automáticamente el {día del
 *   reintento}» (el reintento es automático; no se pide nada a la familia);
 * - fallo final o cancelada: «No se pudo cobrar…», salvo que la factura ya
 *   esté pagada (se pagó a mano): entonces nada;
 * - sin intento todavía: la fecha prevista (día de cobro de la academia); si
 *   ya pasó, «Cobro en curso» durante los mismos días de margen que los
 *   recordatorios (AUTOMATIC_COLLECTION_REMINDER_GRACE_DAYS) y, después, «No
 *   se pudo cobrar…» (la cuota ya vuelve a los recordatorios).
 */
export function familyAutomaticFeeStatusOf(
  input: {
    invoiceStatus: string;
    hasAutomaticCharge: boolean;
    /** `due_at` de la primera cuota automática abierta. */
    nextDueAt: string | Date | null;
    timezone: string;
    collectionDayOfMonth: number | null;
    last: LatestAttemptSnapshot | null;
  },
  now: Date
): FamilyAutomaticFeeStatus | null {
  const last = input.last;
  if (!last && !input.hasAutomaticCharge) return null;
  try {
    if (last) {
      if (last.status === "succeeded") {
        return last.completedAt
          ? { kind: "collected", date: localCalendarDate(last.completedAt, input.timezone) }
          : null;
      }
      if (OPEN_STATUSES.has(last.status)) return { kind: "in_progress" };
      if (input.invoiceStatus === "paid") return null;
      if (last.status === "failed" && last.nextRetryAt) {
        return { kind: "scheduled", date: localCalendarDate(last.nextRetryAt, input.timezone) };
      }
      return { kind: "not_collected" };
    }

    if (input.invoiceStatus !== "issued" && input.invoiceStatus !== "partially_paid") return null;
    const planned = plannedCollectionDate(input);
    if (!planned) return null;
    const today = localCalendarDate(now, input.timezone);
    if (planned >= today) return { kind: "scheduled", date: planned };
    if (today <= addLocalDays(planned, AUTOMATIC_COLLECTION_REMINDER_GRACE_DAYS)) {
      return { kind: "in_progress" };
    }
    return { kind: "not_collected" };
  } catch {
    // Zona horaria o fecha ilegible: mejor no enseñar nada que una fecha falsa.
    return null;
  }
}

/** Facturas que la academia no permite ver (fuera de esta lista) nunca se consultan. */
const FAMILY_STATUS_INVOICE_LIMIT = 100;

/**
 * Estado del cobro automático de las cuotas `invoiceIds` que esta cuenta paga.
 * Resuelve el acceso con el usuario de la sesión y repite la guarda del
 * portal en SQL; una cuota de otra familia o academia simplemente no sale.
 */
export async function getFamilyAutomaticFeeStatuses(input: {
  userId: string;
  invoiceIds: readonly string[];
  now?: Date;
}): Promise<FamilyAutomaticFeeStatuses> {
  const userId = uuidSchema.parse(input.userId);
  const invoiceIds = validIds(input.invoiceIds).slice(0, FAMILY_STATUS_INVOICE_LIMIT);
  if (invoiceIds.length === 0) return {};
  if (!isFamilyAutomaticCollectionOpen()) return {};
  if (!(await isFamilyCollectionStorageAvailable(db))) return {};

  const now = input.now ?? new Date();
  const access = await resolveFamilyPortalAccess({ userId, now });
  const statuses: FamilyAutomaticFeeStatuses = {};

  for (const academy of access.academies) {
    if (academy.feeFamilyIds.length === 0) continue;
    const result = await db.execute(sql`
      select
        i.id::text as "invoiceId",
        i.status::text as "invoiceStatus",
        coalesce(l.timezone, o.default_timezone) as "timezone",
        ocs.collection_day_of_month as "collectionDayOfMonth",
        exists (
          select 1 from zaltyko.charges c
           where c.organization_id = i.organization_id
             and c.invoice_id = i.id
             and c.collection_mode::text = 'automatic'
             and c.status::text <> 'void'
        ) as "hasAutomaticCharge",
        (
          select to_char(min(c.due_at) at time zone 'UTC', ${sql.raw(ISO)})
            from zaltyko.charges c
           where c.organization_id = i.organization_id
             and c.invoice_id = i.id
             and c.collection_mode::text = 'automatic'
             and c.status::text in ('due', 'partially_paid')
        ) as "nextDueAt",
        la.status as "lastStatus",
        la.next_retry_at as "lastNextRetryAt",
        la.completed_at as "lastCompletedAt"
      from zaltyko.invoices i
      join zaltyko.organizations o on o.id = i.organization_id
      left join zaltyko.locations l
        on l.organization_id = i.organization_id and l.id = i.location_id
      left join zaltyko.organization_collection_settings ocs
        on ocs.organization_id = i.organization_id
      left join lateral (
        select a.status, a.next_retry_at, a.completed_at
          from zaltyko.family_collection_attempts a
         where a.organization_id = i.organization_id
           and a.invoice_id = i.id
         order by a.attempt_number desc
         limit 1
      ) la on true
      where i.organization_id = ${academy.organizationId}::uuid
        and i.id in (${uuidList(invoiceIds)})
        and i.family_id in (${uuidList(academy.feeFamilyIds)})
        and i.status::text in ('issued', 'partially_paid', 'paid')
        and ${familyCanViewFees({
          userId,
          now,
          organizationRef: sql`i.organization_id`,
          familyRef: sql`i.family_id`,
        })}
    `);

    for (const row of result.rows as Array<Record<string, unknown>>) {
      const lastStatus = textOrNull(row.lastStatus);
      const status = familyAutomaticFeeStatusOf(
        {
          invoiceStatus: String(row.invoiceStatus),
          hasAutomaticCharge: row.hasAutomaticCharge === true,
          nextDueAt: textOrNull(row.nextDueAt),
          timezone: String(row.timezone),
          collectionDayOfMonth: dayOrNull(row.collectionDayOfMonth),
          last: lastStatus
            ? {
                status: lastStatus,
                nextRetryAt: dateOrNull(row.lastNextRetryAt),
                completedAt: dateOrNull(row.lastCompletedAt),
              }
            : null,
        },
        now
      );
      if (status) statuses[String(row.invoiceId)] = status;
    }
  }
  return statuses;
}

// ---------------------------------------------------------------------------
// Academia: motivos en palabras sencillas
// ---------------------------------------------------------------------------

const DECLINE_TEXT: Record<string, string> = {
  insufficient_funds: "No había saldo suficiente.",
  lost_card: "La tarjeta figura como perdida o robada.",
  stolen_card: "La tarjeta figura como perdida o robada.",
  fraudulent: "El banco ha rechazado el cobro y pide no repetirlo.",
  pickup_card: "El banco ha rechazado el cobro y pide no repetirlo.",
  do_not_try_again: "El banco ha rechazado el cobro y pide no repetirlo.",
  expired_card: "La tarjeta ha caducado.",
  incorrect_cvc: "El banco ha rechazado los datos de la tarjeta.",
  incorrect_number: "El banco ha rechazado los datos de la tarjeta.",
  invalid_account: "El banco ha rechazado los datos de la tarjeta.",
  authentication_required: "El banco pide que la familia confirme el pago.",
  card_velocity_exceeded: "La tarjeta ha superado su límite.",
  withdrawal_count_limit_exceeded: "La tarjeta ha superado su límite.",
  processing_error: "El banco no pudo procesar el cobro.",
  issuer_not_available: "El banco no pudo procesar el cobro.",
  try_again_later: "El banco no pudo procesar el cobro.",
  reenter_transaction: "El banco no pudo procesar el cobro.",
  approve_with_id: "El banco no pudo procesar el cobro.",
  account_closed: "La cuenta bancaria está cerrada.",
  no_account: "La cuenta bancaria no existe.",
  bank_account_restricted: "La cuenta bancaria no admite domiciliaciones.",
  debit_not_authorized: "El banco dice que la familia no autorizó la domiciliación.",
  generic_decline: "El banco ha rechazado el cobro.",
  do_not_honor: "El banco ha rechazado el cobro.",
  card_declined: "El banco ha rechazado el cobro.",
};

const FAILURE_TEXT: Record<string, string> = {
  ...DECLINE_TEXT,
  payment_failed: "El banco ha rechazado el cobro.",
  transient_exhausted: "No pudimos comprobar el cobro a tiempo.",
  invalid_service_period: "La cuota no tiene un periodo válido.",
  manual_payment: "Se registró un pago a mano.",
  canceled_by_academy: "Lo canceló la academia.",
  reviewed_by_academy: "La academia lo revisó y lo cerró.",
  unsupported_currency: "Solo se cobran automáticamente las cuotas en euros.",
  organization_not_active: "La academia no está activa.",
  preference_manual: "La familia pasó a cobro manual.",
  preference_entitlement_stale: "Cambió el plan de la academia: hay que volver a activar el cobro automático de esta familia.",
  charge_scope_mismatch: "La cuota cambió después de emitirse.",
  charge_manual: "La cuota pasó a cobro manual.",
  provider_scope_mismatch: "Tu cuenta de Stripe no está lista para cobrar.",
  provider_environment_mismatch: "Tu cuenta de Stripe no está lista para cobrar.",
  provider_api_generation_unsupported: "Tu cuenta de Stripe no está lista para cobrar.",
  provider_charge_model_unsupported: "Tu cuenta de Stripe no está lista para cobrar.",
  provider_not_ready: "Tu cuenta de Stripe no está lista para cobrar.",
  authorization_missing: "La familia ya no tiene un método de pago activo.",
  authorization_scope_mismatch: "La familia ya no tiene un método de pago activo.",
  authorization_provider_mismatch: "La familia ya no tiene un método de pago activo.",
  authorization_inactive: "La familia ya no tiene un método de pago activo.",
  authorization_expired: "La familia ya no tiene un método de pago activo.",
  consent_incomplete: "La familia ya no tiene un método de pago activo.",
  payment_method_unknown: "La familia ya no tiene un método de pago activo.",
  sepa_not_active: "La domiciliación no está activa en tu cuenta de Stripe.",
  charge_payer_mismatch: "Cambió la persona que paga la cuota.",
  payer_missing: "Cambió la persona que paga la cuota.",
  payer_not_current: "Cambió la persona que paga la cuota.",
};

const REVIEW_TEXT: Record<string, string> = {
  allocation: "Se cobró, pero no se pudo repartir entre las cuotas. Revisa los pagos de esta familia.",
  payment_recorded_for_other_attempt: "Este cobro ya estaba registrado en otra cuota. Compruébalo en Stripe.",
  multiple_payments: "Hay más de un cobro para esta cuota. Compruébalo en Stripe.",
  resume_exhausted: "No pudimos confirmar el resultado del cobro. Compruébalo en Stripe.",
  attempt_unreadable: "No pudimos confirmar el resultado del cobro. Compruébalo en Stripe.",
};

const REVIEW_FALLBACK = "El cobro necesita una comprobación. Compruébalo en Stripe.";
const FAILURE_FALLBACK = "No se pudo cobrar automáticamente.";

/** Motivo de un fallo o una cancelación en palabras sencillas (nunca el código). */
export function failureReasonText(input: { failureCode: string | null; declineCode: string | null }): string {
  return (
    (input.declineCode ? DECLINE_TEXT[input.declineCode] : undefined) ??
    (input.failureCode ? FAILURE_TEXT[input.failureCode] : undefined) ??
    FAILURE_FALLBACK
  );
}

/** Motivo de un aviso de revisión en palabras sencillas (nunca el código). */
export function reviewReasonText(reason: string | null): string {
  return (reason ? REVIEW_TEXT[reason] : undefined) ?? REVIEW_FALLBACK;
}

// ---------------------------------------------------------------------------
// Academia: cobros automáticos del mes (/owner/payments)
// ---------------------------------------------------------------------------

/**
 * Estado de un cobro automático para la academia:
 * - `scheduled`: aún no ha llegado su día (`date`);
 * - `in_progress`: se está cobrando (o su día ya llegó y el proceso diario
 *   todavía no lo ha intentado);
 * - `processing`: la domiciliación ya está en el banco;
 * - `collected`: cobrada (`date`);
 * - `retry_scheduled`: falló y se reintentará (`date`);
 * - `failed`: falló sin reintento; se cobra a mano;
 * - `canceled`: cancelado (por la puerta, la academia, un pago a mano o una revisión);
 * - `not_attempted`: pasó su día y el margen sin poder intentarlo; se cobra a mano.
 */
export type OwnerAutomaticCollectionState =
  | "scheduled"
  | "in_progress"
  | "processing"
  | "collected"
  | "retry_scheduled"
  | "failed"
  | "canceled"
  | "not_attempted";

export interface OwnerAutomaticCollectionItem {
  invoiceId: string;
  invoiceReference: string;
  payerName: string | null;
  amountCents: number;
  currency: string;
  state: OwnerAutomaticCollectionState;
  /** Día local de la sede (YYYY-MM-DD) que acompaña al estado, si lo hay. */
  date: string | null;
  /** Motivo en palabras sencillas: por qué falló, se canceló o hay que revisarlo. */
  reason: string | null;
  needsReview: boolean;
  /** «Cancelar el cobro automático» (reintento pendiente o cobro creado sin confirmar). */
  canCancel: boolean;
  /** «Marcar como revisado» (intento abierto con aviso o reanudaciones agotadas). */
  canMarkReviewed: boolean;
  /** Hay un intento en curso: el pago a mano responde 409 hasta que termine. */
  manualPaymentBlocked: boolean;
}

export interface OwnerAutomaticCollectionsView {
  /** Mes en curso en la zona de la academia, YYYY-MM. */
  month: string;
  items: OwnerAutomaticCollectionItem[];
  /** Hay más cobros de los que se enseñan. */
  truncated: boolean;
}

/** Fila de la consulta de la academia, ya tipada. */
export interface OwnerCollectionRow {
  invoiceId: string;
  invoiceReference: string;
  invoiceStatus: string;
  payerName: string | null;
  currency: string;
  timezone: string;
  collectionDayOfMonth: number | null;
  nextDueAt: string | null;
  openAutomaticCents: number;
  attempt: {
    status: string;
    amountCents: number;
    failureCode: string | null;
    declineCode: string | null;
    nextRetryAt: Date | null;
    completedAt: Date | null;
    resumeCount: number;
    allocationStatus: string | null;
    hasReviewNotice: boolean;
    reviewReason: string | null;
  } | null;
}

/**
 * Un cobro de la lista de la academia, o `null` si no es de este mes. Pura.
 * Las acciones siguen las reglas de family-collection-academy-actions.ts: el
 * servidor las vuelve a comprobar al pulsar.
 */
export function ownerAutomaticCollectionItemOf(
  row: OwnerCollectionRow,
  now: Date,
  month: string
): OwnerAutomaticCollectionItem | null {
  const base = {
    invoiceId: row.invoiceId,
    invoiceReference: row.invoiceReference,
    payerName: row.payerName,
    currency: row.currency,
  };
  try {
    const attempt = row.attempt;
    if (!attempt) {
      const planned = plannedCollectionDate(row);
      if (!planned || planned.slice(0, 7) !== month) return null;
      const today = localCalendarDate(now, row.timezone);
      const state: OwnerAutomaticCollectionState =
        planned >= today
          ? "scheduled"
          : today <= addLocalDays(planned, AUTOMATIC_COLLECTION_REMINDER_GRACE_DAYS)
            ? "in_progress"
            : "not_attempted";
      return {
        ...base,
        amountCents: row.openAutomaticCents,
        state,
        date: planned,
        reason:
          state === "not_attempted"
            ? "No se pudo intentar el cobro a tiempo. Se cobra a mano."
            : null,
        needsReview: false,
        canCancel: false,
        canMarkReviewed: false,
        manualPaymentBlocked: false,
      };
    }

    const open = OPEN_STATUSES.has(attempt.status);
    const canMarkReviewed =
      open && (attempt.hasReviewNotice || attempt.resumeCount >= FAMILY_COLLECTION_MAX_RESUMES);
    const allocationReview = attempt.status === "succeeded" && attempt.allocationStatus === "needs_review";
    const needsReview = canMarkReviewed || allocationReview;
    const reviewText = allocationReview
      ? reviewReasonText("allocation")
      : canMarkReviewed
        ? reviewReasonText(attempt.reviewReason ?? (attempt.hasReviewNotice ? null : "resume_exhausted"))
        : null;
    const failureText = failureReasonText(attempt);
    const local = (instant: Date | null) => (instant ? localCalendarDate(instant, row.timezone) : null);

    let state: OwnerAutomaticCollectionState;
    let date: string | null = null;
    let reason: string | null = reviewText;
    switch (attempt.status) {
      case "succeeded":
        state = "collected";
        date = local(attempt.completedAt);
        break;
      case "processing":
        state = "processing";
        reason = reviewText ?? "La domiciliación está en el banco; tarda unos días.";
        break;
      case "claimed":
      case "created":
        state = "in_progress";
        break;
      case "failed":
        if (attempt.nextRetryAt) {
          state = "retry_scheduled";
          date = local(attempt.nextRetryAt);
        } else {
          state = "failed";
          date = local(attempt.completedAt);
        }
        reason = failureText;
        break;
      default:
        state = "canceled";
        date = local(attempt.completedAt);
        reason = failureText;
        break;
    }
    return {
      ...base,
      amountCents: attempt.amountCents,
      state,
      date,
      reason,
      needsReview,
      canCancel: attempt.status === "created" || (attempt.status === "failed" && attempt.nextRetryAt !== null),
      canMarkReviewed,
      manualPaymentBlocked: open,
    };
  } catch {
    return null;
  }
}

/** Cobros que se enseñan como mucho; el resto, en Stripe o en las cuotas. */
export const OWNER_AUTOMATIC_COLLECTIONS_LIMIT = 100;

/**
 * Cobros automáticos del mes de la academia: los intentados este mes, los
 * que siguen abiertos o con reintento pendiente (aunque empezaran antes) y
 * las cuotas automáticas cuyo día de cobro cae en este mes y aún no tienen
 * intento. Solo propiedad, o administración con todas las sedes (las mismas
 * personas que pueden cancelar o marcar como revisado); para el resto, `null`.
 */
export async function getOwnerAutomaticCollections(input: {
  userId: string;
  organizationId: string;
  now?: Date;
}): Promise<OwnerAutomaticCollectionsView | null> {
  const userId = uuidSchema.parse(input.userId);
  const organizationIdInput = uuidSchema.parse(input.organizationId);
  if (!isFamilyAutomaticCollectionOpen()) return null;
  const scope = await resolveOwnerScope({ userId, organizationId: organizationIdInput });
  const allowed =
    scope.member.role === "owner" ||
    (scope.member.role === "admin" && scope.member.locationScopeMode === "all");
  if (!allowed) return null;
  if (!(await isFamilyCollectionStorageAvailable(db))) return null;

  const organizationId = scope.organization.id;
  const now = input.now ?? new Date();
  const timezoneRow = await db.execute(sql`
    select default_timezone as "timezone" from zaltyko.organizations where id = ${organizationId}::uuid
  `);
  const organizationTimezone = String(
    (timezoneRow.rows[0] as { timezone?: unknown } | undefined)?.timezone ?? "Europe/Madrid"
  );
  const today = localCalendarDate(now, organizationTimezone);
  const month = today.slice(0, 7);
  const monthStart = `${month}-01`;
  const nextMonthStart = addLocalDays(monthStart, 32).slice(0, 7) + "-01";
  // Margen de dos días a cada lado: el mes se decide luego con la zona de cada sede.
  const windowStart = startOfLocalDay(addLocalDays(monthStart, -2), organizationTimezone).toISOString();
  const windowEnd = startOfLocalDay(addLocalDays(nextMonthStart, 2), organizationTimezone).toISOString();
  const monthStartInstant = startOfLocalDay(monthStart, organizationTimezone).toISOString();
  const nextMonthInstant = startOfLocalDay(nextMonthStart, organizationTimezone).toISOString();

  const result = await db.execute(sql`
    select
      i.id::text as "invoiceId",
      i.reference as "invoiceReference",
      i.status::text as "invoiceStatus",
      i.currency as "currency",
      coalesce(l.timezone, o.default_timezone) as "timezone",
      nullif(btrim(concat_ws(' ', p.given_name, p.family_name)), '') as "payerName",
      ocs.collection_day_of_month as "collectionDayOfMonth",
      (
        select to_char(min(c.due_at) at time zone 'UTC', ${sql.raw(ISO)})
          from zaltyko.charges c
         where c.organization_id = i.organization_id
           and c.invoice_id = i.id
           and c.collection_mode::text = 'automatic'
           and c.status::text in ('due', 'partially_paid')
      ) as "nextDueAt",
      (
        select coalesce(sum(c.amount_cents - coalesce((
                 select sum(pa.amount_cents)
                   from zaltyko.payment_allocations pa
                  where pa.organization_id = c.organization_id and pa.charge_id = c.id
               ), 0)), 0)::text
          from zaltyko.charges c
         where c.organization_id = i.organization_id
           and c.invoice_id = i.id
           and c.collection_mode::text = 'automatic'
           and c.status::text in ('due', 'partially_paid')
      ) as "openAutomaticCents",
      la.status as "attemptStatus",
      la.amount_cents::text as "attemptAmountCents",
      la.failure_code as "failureCode",
      la.decline_code as "declineCode",
      la.next_retry_at as "nextRetryAt",
      la.completed_at as "completedAt",
      la.resume_count as "resumeCount",
      la.allocation_status as "allocationStatus",
      la.review_reason as "reviewReason",
      la.has_review_notice as "hasReviewNotice"
    from zaltyko.invoices i
    join zaltyko.organizations o on o.id = i.organization_id
    left join zaltyko.locations l
      on l.organization_id = i.organization_id and l.id = i.location_id
    left join zaltyko.organization_collection_settings ocs
      on ocs.organization_id = i.organization_id
    left join zaltyko.family_payers fp
      on fp.organization_id = i.organization_id
     and fp.family_id = i.family_id
     and fp.id = i.family_payer_id
    left join zaltyko.guardians g
      on g.organization_id = fp.organization_id and g.id = fp.guardian_id
    left join zaltyko.people p
      on p.organization_id = g.organization_id and p.id = g.person_id
    left join lateral (
      select a.id, a.status, a.amount_cents, a.failure_code, a.decline_code,
             a.next_retry_at, a.completed_at, a.claimed_at, a.resume_count,
             a.allocation_status,
             (
               select e.payload ->> 'reason'
                 from zaltyko.outbox_events e
                where e.organization_id = a.organization_id
                  and e.event_name = ${NEEDS_REVIEW_EVENT}
                  and e.idempotency_key like 'family-collection:' || a.id::text || ':needs_review:%'
                order by e.occurred_at desc
                limit 1
             ) as review_reason,
             exists (
               select 1
                 from zaltyko.outbox_events e
                where e.organization_id = a.organization_id
                  and e.event_name = ${NEEDS_REVIEW_EVENT}
                  and e.idempotency_key like 'family-collection:' || a.id::text || ':needs_review:%'
             ) as has_review_notice
        from zaltyko.family_collection_attempts a
       where a.organization_id = i.organization_id
         and a.invoice_id = i.id
       order by a.attempt_number desc
       limit 1
    ) la on true
    where i.organization_id = ${organizationId}::uuid
      and i.status::text <> 'draft'
      and (
        (
          la.id is not null
          and (
            (la.claimed_at >= ${monthStartInstant}::timestamptz and la.claimed_at < ${nextMonthInstant}::timestamptz)
            or la.status in ('claimed', 'created', 'processing')
            or (la.status = 'failed' and la.next_retry_at is not null)
          )
        )
        or (
          la.id is null
          and i.status::text in ('issued', 'partially_paid')
          and exists (
            select 1 from zaltyko.charges c
             where c.organization_id = i.organization_id
               and c.invoice_id = i.id
               and c.collection_mode::text = 'automatic'
               and c.status::text in ('due', 'partially_paid')
               and c.due_at >= ${windowStart}::timestamptz
               and c.due_at < ${windowEnd}::timestamptz
          )
        )
      )
    order by coalesce(la.claimed_at, i.due_at) desc, i.reference asc
    limit ${OWNER_AUTOMATIC_COLLECTIONS_LIMIT + 1}
  `);

  const rows = result.rows as Array<Record<string, unknown>>;
  const items = rows.slice(0, OWNER_AUTOMATIC_COLLECTIONS_LIMIT).flatMap((row) => {
    const attemptStatus = textOrNull(row.attemptStatus);
    const item = ownerAutomaticCollectionItemOf(
      {
        invoiceId: String(row.invoiceId),
        invoiceReference: String(row.invoiceReference),
        invoiceStatus: String(row.invoiceStatus),
        payerName: textOrNull(row.payerName),
        currency: String(row.currency),
        timezone: String(row.timezone),
        collectionDayOfMonth: dayOrNull(row.collectionDayOfMonth),
        nextDueAt: textOrNull(row.nextDueAt),
        openAutomaticCents: cents(row.openAutomaticCents),
        attempt: attemptStatus
          ? {
              status: attemptStatus,
              amountCents: cents(row.attemptAmountCents),
              failureCode: textOrNull(row.failureCode),
              declineCode: textOrNull(row.declineCode),
              nextRetryAt: dateOrNull(row.nextRetryAt),
              completedAt: dateOrNull(row.completedAt),
              resumeCount: Number(row.resumeCount ?? 0),
              allocationStatus: textOrNull(row.allocationStatus),
              hasReviewNotice: row.hasReviewNotice === true,
              reviewReason: textOrNull(row.reviewReason),
            }
          : null,
      },
      now,
      month
    );
    return item ? [item] : [];
  });
  return { month, items, truncated: rows.length > OWNER_AUTOMATIC_COLLECTIONS_LIMIT };
}

// ---------------------------------------------------------------------------
// Academia: interruptor «Cobrar automáticamente» por familia (/owner/familias)
// ---------------------------------------------------------------------------

export interface OwnerFamilyCollectionSwitch {
  /** Interruptor encendido: la familia pidió cobro automático y sigue valiendo. */
  automatic: boolean;
  /** Versión de la preferencia (0 si nunca se guardó), para el guardado optimista. */
  version: number;
  /** Lo pidió, pero cambió el plan: hay que volver a activarlo. */
  requiresConfirmation: boolean;
}

export interface OwnerFamilyCollectionSwitches {
  /** La academia tiene un plan de pago vigente (sin él no se puede encender). */
  available: boolean;
  families: Record<string, OwnerFamilyCollectionSwitch>;
}

/**
 * Estado del interruptor de cada familia de `familyIds`, con la misma regla
 * que la preferencia de la Tarea 4 (getFamilyCollectionPreference): solo
 * propiedad o administración con todas las sedes; para el resto, `null`.
 */
export async function getOwnerFamilyCollectionSwitches(input: {
  userId: string;
  organizationId: string;
  familyIds: readonly string[];
  now?: Date;
}): Promise<OwnerFamilyCollectionSwitches | null> {
  const userId = uuidSchema.parse(input.userId);
  const organizationIdInput = uuidSchema.parse(input.organizationId);
  const familyIds = validIds(input.familyIds);
  if (familyIds.length === 0) return null;
  if (!isFamilyAutomaticCollectionOpen()) return null;
  const scope = await resolveOwnerScope({ userId, organizationId: organizationIdInput });
  if (scope.member.role !== "owner" && scope.member.role !== "admin") return null;
  if (!scope.canViewOrganizationAggregate) return null;
  if (!(await isFamilyCollectionStorageAvailable(db))) return null;

  const organizationId = scope.organization.id;
  const planState = await loadOrganizationPlanState(db, organizationId);
  const plan = evaluateAutomaticCollectionPlanEligibility({
    organizationId,
    entitlement: planState.entitlement,
    subscription: planState.subscription,
    now: input.now ?? new Date(),
  });

  const stored = await db
    .select({
      familyId: familyCollectionPreferences.familyId,
      requestedMode: familyCollectionPreferences.requestedMode,
      version: familyCollectionPreferences.version,
      entitlementRevision: familyCollectionPreferences.entitlementRevision,
    })
    .from(familyCollectionPreferences)
    .where(
      and(
        eq(familyCollectionPreferences.organizationId, organizationId),
        inArray(familyCollectionPreferences.familyId, familyIds)
      )
    );
  const planChangeRevision =
    plan.eligible && stored.some((row) => row.requestedMode === "automatic")
      ? await loadPlanChangeRevision(db, organizationId)
      : null;

  const families: Record<string, OwnerFamilyCollectionSwitch> = {};
  for (const familyId of familyIds) {
    families[familyId] = { automatic: false, version: 0, requiresConfirmation: false };
  }
  for (const row of stored) {
    const requested = row.requestedMode === "automatic";
    const stale =
      requested &&
      plan.eligible &&
      !isPreferenceRevisionCurrent({
        preferenceRevision: row.entitlementRevision ?? null,
        currentRevision: plan.entitlementRevision,
        planChangeRevision,
      });
    families[row.familyId] = {
      automatic: requested && plan.eligible && !stale,
      version: row.version,
      requiresConfirmation: stale,
    };
  }
  return { available: plan.eligible, families };
}

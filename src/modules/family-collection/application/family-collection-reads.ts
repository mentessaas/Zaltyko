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
 * Nunca se promete un cobro que ya no puede llegar: antes de enseñar «se
 * cobrará» (sin intento, o con un reintento pendiente) se comprueba, solo
 * leyendo y como la puerta del cobro, que la academia tiene un plan de pago,
 * que la preferencia automática de la familia sigue valiendo y que el
 * pagador de la factura tiene una autorización activa en la cuenta de la
 * academia, que no es una domiciliación mientras la domiciliación no se cobra
 * sola (ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED apagada, «Primero
 * solo tarjeta»). Si falta algo, la familia no ve nada y la academia ve «Se
 * cobrará a mano» con el motivo.
 *
 * Con la bandera apagada solo se enseña lo que ya está en marcha (intentos
 * `claimed`, `created` o `processing`): «Cobro en curso» en el portal y esos
 * cobros en la lista de la academia, que el pago a mano tiene bloqueados. El
 * interruptor de cada familia no se lee. Fuera de la clave de test, contra la
 * base de producción o sin las tablas de las Fases 1, 2 y 3, la academia no
 * ve nada. Nunca salen códigos del banco ni de Stripe: los motivos se traducen aquí.
 */
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { familyCollectionPreferences } from "@/db/zaltyko-schema";
import {
  areFamilyCollectionLocksOpen,
  isFamilyAutomaticCollectionOpen,
} from "@/modules/billing/application/charge-collection-mode";
import {
  loadOrganizationPlanState,
  loadPlanChangeRevision,
} from "@/modules/billing/application/plan-state";
import { isPreferenceRevisionCurrent } from "@/modules/billing/domain/collection-eligibility";
import {
  evaluateAutomaticCollectionPlanEligibility,
  type AutomaticPlanEligibility,
} from "@/modules/billing/domain/plan-eligibility";
import { isFamilyAutomaticSepaCollectionFlagEnabled } from "@/modules/family-collection/application/config";
import {
  isFamilyCollectionStorageAvailable,
  isPaymentRemindersTablePresent,
} from "@/modules/family-collection/application/storage";
import { REMINDER_SENT_REASON, SEPA_NOT_ENABLED_REASON } from "@/modules/family-collection/domain/collection-gate";
import {
  addLocalDays,
  collectionDate,
  localCalendarDate,
  startOfLocalDay,
} from "@/modules/family-collection/domain/collection-plan";
import { FAMILY_FAILURE_NOTICE_RESULT_EVENT } from "@/modules/family-collection/domain/family-failure-notice";
import { AMOUNT_MISMATCH_REASON } from "@/modules/family-collection/domain/payment-outcome";
import { NEEDS_REVIEW_EVENT } from "@/modules/family-collection/infrastructure/family-collection-store";
import {
  academyCanMarkReviewed,
  COLLECTION_WINDOW_EXPIRED_CODE,
  FAMILY_COLLECTION_MAX_RESUMES,
  FAMILY_COLLECTION_OPEN_STATUSES,
  isLongProcessingAttempt,
} from "@/modules/family-collection/infrastructure/family-collection-schema";
import { isFamilyPaymentMethodsStorageAvailable } from "@/modules/family-payment-methods/application/storage";
import { resolveFamilyPortalAccess } from "@/modules/family-portal/application/family-portal-access";
import { familyCanViewFees } from "@/modules/family-portal/application/family-portal-sql";
import type {
  FamilyAutomaticCollectionModes,
  FamilyAutomaticFeeStatus,
  FamilyAutomaticFeeStatuses,
} from "@/modules/family-portal/domain/family-portal-presentation";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { withinGrace } from "@/modules/payment-reminders/domain/reminder-policy";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";

export type { FamilyAutomaticCollectionModes, FamilyAutomaticFeeStatus, FamilyAutomaticFeeStatuses };

const OPEN_STATUSES: ReadonlySet<string> = new Set(FAMILY_COLLECTION_OPEN_STATUSES);
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

function integerOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function cents(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

/** Tablas de las Fases 1, 2 y 3: las consultas de este archivo leen de las tres. */
async function collectionTablesAvailable(): Promise<boolean> {
  const [collection, paymentMethods, connect] = await Promise.all([
    isFamilyCollectionStorageAvailable(db),
    isFamilyPaymentMethodsStorageAvailable(db),
    isConnectOnboardingStorageAvailable(db),
  ]);
  return collection && paymentMethods && connect;
}

// ---------------------------------------------------------------------------
// ¿Puede llegar todavía el cobro automático? (solo lectura, como la puerta)
// ---------------------------------------------------------------------------

/** Lo que hace falta para que un cobro automático pendiente pueda llegar. */
export interface AutomaticCollectionPrerequisites {
  plan: AutomaticPlanEligibility;
  planChangeRevision: number | null;
  /** `requested_mode` de la preferencia de la familia, o null si nunca se guardó. */
  preferenceMode: string | null;
  preferenceRevision: number | null;
  /** El pagador de la factura tiene una autorización activa en la cuenta de test de la academia. */
  hasActiveAuthorization: boolean;
  /** Tipo de esa autorización (`card`, `sepa_debit`), si se leyó. */
  activeAuthorizationKind?: string | null;
  /**
   * La domiciliación se cobra sola (ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED).
   * Sin indicar, apagada: nunca se promete un cobro por domiciliación.
   */
  sepaEnabled?: boolean;
  /**
   * Ya salió (o está saliendo) un recordatorio de pago de alguna cuota
   * abierta de la factura: la puerta cancelará el cobro (`reminder_sent`).
   */
  reminderSent?: boolean;
}

/**
 * Motivo (código interno) por el que un cobro automático pendiente ya no
 * puede llegar, o `null` si todo sigue en pie. Mismo orden y mismas reglas
 * que la puerta (collection-gate.ts): recordatorio de pago ya enviado,
 * domiciliación sin activar, plan de la academia, preferencia de la familia
 * (con la regla del cambio de plan) y autorización del pagador.
 */
export function automaticCollectionBlocker(input: AutomaticCollectionPrerequisites): string | null {
  // Tras un recordatorio la familia pudo pagar por fuera: la puerta lo cancela.
  if (input.reminderSent === true) return REMINDER_SENT_REASON;
  if (input.activeAuthorizationKind === "sepa_debit" && input.sepaEnabled !== true) {
    return SEPA_NOT_ENABLED_REASON;
  }
  if (!input.plan.eligible) return input.plan.reason;
  if (input.preferenceMode !== "automatic") return "preference_manual";
  if (
    !isPreferenceRevisionCurrent({
      preferenceRevision: input.preferenceRevision,
      currentRevision: input.plan.entitlementRevision,
      planChangeRevision: input.planChangeRevision,
    })
  ) {
    return "preference_entitlement_stale";
  }
  if (!input.hasActiveAuthorization) return "authorization_missing";
  return null;
}

/** Plan de la academia y su última revisión con cambio real (una vez por academia). */
async function loadPlan(
  organizationId: string,
  now: Date
): Promise<{ plan: AutomaticPlanEligibility; planChangeRevision: number | null }> {
  const planState = await loadOrganizationPlanState(db, organizationId);
  const plan = evaluateAutomaticCollectionPlanEligibility({
    organizationId,
    entitlement: planState.entitlement,
    subscription: planState.subscription,
    now,
  });
  return {
    plan,
    planChangeRevision: plan.eligible ? await loadPlanChangeRevision(db, organizationId) : null,
  };
}

/**
 * Columnas SQL de la preferencia de la familia de la factura, de la
 * autorización activa de su pagador en la cuenta de test de la academia (la
 * que usa el proceso de cobro) y de si ya salió un recordatorio de pago de
 * alguna de sus cuotas abiertas (la misma regla que readReminderSent del
 * almacén: enviado o reservado). Sin la tabla de recordatorios
 * (`remindersTable` falso) no salió ninguno. Necesitan `i` (zaltyko.invoices).
 */
const prerequisiteColumns = (remindersTable: boolean) => sql`
  ${
    remindersTable
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
      : sql`false`
  } as "reminderSent",
  (
    select fcp.requested_mode::text
      from zaltyko.family_collection_preferences fcp
     where fcp.organization_id = i.organization_id and fcp.family_id = i.family_id
     limit 1
  ) as "preferenceMode",
  (
    select fcp.entitlement_revision
      from zaltyko.family_collection_preferences fcp
     where fcp.organization_id = i.organization_id and fcp.family_id = i.family_id
     limit 1
  ) as "preferenceRevision",
  exists (
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
  ) as "hasActiveAuthorization",
  (
    select au.payment_method_kind
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
     limit 1
  ) as "activeAuthorizationKind"
`;

function prerequisitesOf(
  row: Record<string, unknown>,
  plan: { plan: AutomaticPlanEligibility; planChangeRevision: number | null }
): AutomaticCollectionPrerequisites {
  return {
    plan: plan.plan,
    planChangeRevision: plan.planChangeRevision,
    preferenceMode: textOrNull(row.preferenceMode),
    preferenceRevision: integerOrNull(row.preferenceRevision),
    hasActiveAuthorization: row.hasActiveAuthorization === true,
    activeAuthorizationKind: textOrNull(row.activeAuthorizationKind),
    sepaEnabled: isFamilyAutomaticSepaCollectionFlagEnabled(),
    reminderSent: row.reminderSent === true,
  };
}

/** Último intento de cobro de una factura, con lo que necesitan las pantallas. */
export interface LatestAttemptSnapshot {
  status: string;
  nextRetryAt: Date | null;
  completedAt: Date | null;
  /** Motivo de cierre (`failure_code`), si se leyó. */
  failureCode?: string | null;
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

/**
 * Un cobro que se espera para el día `dateLocal`: futuro (`scheduled`), ya
 * pasado pero dentro de la espera de los recordatorios (`due`), o pasado y
 * fuera de ella (`lapsed`: la cuota ya se cobra a mano).
 */
function expectedCharge(dateLocal: string, todayLocal: string): "scheduled" | "due" | "lapsed" {
  if (dateLocal >= todayLocal) return "scheduled";
  return withinGrace(dateLocal, todayLocal) ? "due" : "lapsed";
}

// ---------------------------------------------------------------------------
// Familia
// ---------------------------------------------------------------------------

/**
 * Estado del cobro automático de una cuota para la familia, o `null` si la
 * cuota no se cobra sola (o ya no se va a cobrar sola sin más). Pura.
 *
 * - cobrada: «Cobrada automáticamente el {día del cobro}»;
 * - intento en curso (`claimed`, `created`, `processing`): «Cobro en curso»;
 * - sin intento todavía, o fallida con un reintento pendiente: solo si el
 *   cobro aún puede llegar (`blocker` nulo); si no, nada (la academia dirá
 *   cómo pagarla). Con fecha futura, «Se cobrará automáticamente el {día}»;
 *   ya pasada, «Cobro en curso» dentro de la espera de los recordatorios
 *   (`withinGrace`) y, fuera de ella, «No se pudo cobrar…»;
 * - fallo final o cancelada: «No se pudo cobrar…», salvo que la factura ya
 *   esté pagada (se pagó a mano) o que se cancelara porque la domiciliación
 *   todavía no se cobra sola (`sepa_not_enabled`: nunca se intentó; la
 *   familia paga como siempre): entonces nada.
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
    /** automaticCollectionBlocker: por qué el cobro pendiente ya no puede llegar. */
    blocker: string | null;
  },
  now: Date
): FamilyAutomaticFeeStatus | null {
  const last = input.last;
  if (!last && !input.hasAutomaticCharge) return null;
  try {
    const today = localCalendarDate(now, input.timezone);
    const pending = (dateLocal: string): FamilyAutomaticFeeStatus | null => {
      if (input.blocker) return null;
      const expected = expectedCharge(dateLocal, today);
      return expected === "scheduled"
        ? { kind: "scheduled", date: dateLocal }
        : expected === "due"
          ? { kind: "in_progress" }
          : { kind: "not_collected" };
    };

    if (last) {
      if (last.status === "succeeded") {
        return last.completedAt
          ? { kind: "collected", date: localCalendarDate(last.completedAt, input.timezone) }
          : null;
      }
      if (OPEN_STATUSES.has(last.status)) return { kind: "in_progress" };
      if (input.invoiceStatus === "paid") return null;
      // Nunca se intentó cobrar (domiciliación sin activar): nada que contar.
      if (last.status === "canceled" && last.failureCode === SEPA_NOT_ENABLED_REASON) return null;
      if (last.status === "failed" && last.nextRetryAt) {
        return pending(localCalendarDate(last.nextRetryAt, input.timezone));
      }
      return { kind: "not_collected" };
    }

    if (input.invoiceStatus !== "issued" && input.invoiceStatus !== "partially_paid") return null;
    const planned = plannedCollectionDate(input);
    return planned ? pending(planned) : null;
  } catch {
    // Zona horaria o fecha ilegible: mejor no enseñar nada que una fecha falsa.
    return null;
  }
}

/** Como mucho, las cuotas que enseña el portal por página. */
const FAMILY_STATUS_INVOICE_LIMIT = 100;

/**
 * Estado del cobro automático de las cuotas `invoiceIds` que esta cuenta paga.
 * Resuelve el acceso con el usuario de la sesión y repite la guarda del
 * portal en SQL; una cuota de otra familia o academia simplemente no sale.
 *
 * Con la bandera apagada o los cerrojos cerrados solo se enseña «Cobro en
 * curso» de las cuotas con un intento en marcha (`claimed`, `created`,
 * `processing`): el proceso diario lo sigue releyendo y su dinero puede
 * moverse todavía, así que la familia no debe pagarla por fuera (el pago
 * manual también está bloqueado). Nada de fechas ni de «no se pudo cobrar»:
 * sin la bandera no se cobra nada nuevo.
 */
export async function getFamilyAutomaticFeeStatuses(input: {
  userId: string;
  invoiceIds: readonly string[];
  now?: Date;
}): Promise<FamilyAutomaticFeeStatuses> {
  const userId = uuidSchema.parse(input.userId);
  const invoiceIds = validIds(input.invoiceIds).slice(0, FAMILY_STATUS_INVOICE_LIMIT);
  if (invoiceIds.length === 0) return {};
  const automaticOpen = isFamilyAutomaticCollectionOpen();
  // La consulta lee también las tablas de las Fases 1 y 2; un intento solo
  // puede existir si están las tres.
  if (!(await collectionTablesAvailable())) return {};
  // Solo con el cobro abierto se mira si el cobro pendiente aún puede llegar.
  const remindersTable = automaticOpen && (await isPaymentRemindersTablePresent(db));

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
        ${prerequisiteColumns(remindersTable)},
        la.status as "lastStatus",
        la.next_retry_at as "lastNextRetryAt",
        la.completed_at as "lastCompletedAt",
        la.failure_code as "lastFailureCode"
      from zaltyko.invoices i
      join zaltyko.organizations o on o.id = i.organization_id
      left join zaltyko.locations l
        on l.organization_id = i.organization_id and l.id = i.location_id
      left join zaltyko.organization_collection_settings ocs
        on ocs.organization_id = i.organization_id
      left join lateral (
        select a.status, a.next_retry_at, a.completed_at, a.failure_code
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
    const rows = result.rows as Array<Record<string, unknown>>;
    if (rows.length === 0) continue;

    if (!automaticOpen) {
      // Cobro automático cerrado: solo los cobros que ya están en marcha.
      for (const row of rows) {
        const lastStatus = textOrNull(row.lastStatus);
        if (lastStatus && OPEN_STATUSES.has(lastStatus)) statuses[String(row.invoiceId)] = { kind: "in_progress" };
      }
      continue;
    }

    const plan = await loadPlan(academy.organizationId, now);
    for (const row of rows) {
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
                failureCode: textOrNull(row.lastFailureCode),
              }
            : null,
          blocker: automaticCollectionBlocker(prerequisitesOf(row, plan)),
        },
        now
      );
      if (status) statuses[String(row.invoiceId)] = status;
    }
  }
  return statuses;
}

/**
 * Para la tarjeta «Pago automático» del portal: si el cobro automático está
 * abierto (bandera, cerrojos de R11 y tablas de las Fases 1, 2 y 3) y, por
 * academia, qué familias de la cuenta tienen sus cuotas en cobro automático
 * (misma regla que el interruptor de la academia, getOwnerFamilyCollectionSwitches:
 * preferencia automática que sigue valiendo y plan de pago vigente). Solo las
 * familias cuyas cuotas ve la cuenta (`feeFamilyIds` de la sesión). Cerrado
 * o sin tablas, ninguna: la tarjeta no promete ningún cobro.
 */
export async function getFamilyAutomaticCollectionModes(input: {
  userId: string;
  now?: Date;
}): Promise<FamilyAutomaticCollectionModes> {
  const userId = uuidSchema.parse(input.userId);
  if (!isFamilyAutomaticCollectionOpen()) return { open: false, automaticFamilies: {} };
  if (!(await collectionTablesAvailable())) return { open: false, automaticFamilies: {} };

  const now = input.now ?? new Date();
  const access = await resolveFamilyPortalAccess({ userId, now });
  const automaticFamilies: Record<string, string[]> = {};
  for (const academy of access.academies) {
    const familyIds = validIds(academy.feeFamilyIds);
    if (familyIds.length === 0) continue;
    const { plan, planChangeRevision } = await loadPlan(academy.organizationId, now);
    if (!plan.eligible) continue;
    const stored = await db
      .select({
        familyId: familyCollectionPreferences.familyId,
        requestedMode: familyCollectionPreferences.requestedMode,
        entitlementRevision: familyCollectionPreferences.entitlementRevision,
      })
      .from(familyCollectionPreferences)
      .where(
        and(
          eq(familyCollectionPreferences.organizationId, academy.organizationId),
          inArray(familyCollectionPreferences.familyId, familyIds)
        )
      );
    const automatic = stored
      .filter(
        (row) =>
          row.requestedMode === "automatic" &&
          familyIds.includes(row.familyId) &&
          isPreferenceRevisionCurrent({
            preferenceRevision: row.entitlementRevision ?? null,
            currentRevision: plan.entitlementRevision,
            planChangeRevision,
          })
      )
      .map((row) => row.familyId);
    if (automatic.length > 0) automaticFamilies[academy.organizationId] = automatic;
  }
  return { open: true, automaticFamilies };
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

const NOT_ATTEMPTED_TEXT = "No se pudo intentar el cobro a tiempo. Se cobra a mano.";
const NOT_RELEASED = "El cobro automático de cuotas no está activado.";
const PLAN_REQUIRED = "Tu plan no incluye el cobro automático de cuotas.";
const PLAN_NOT_ACTIVE = "El plan de la academia no está activo ahora mismo.";
const SUBSCRIPTION_NOT_CURRENT = "La suscripción de la academia a Zaltyko no está al día.";
const STRIPE_NOT_READY = "Tu cuenta de Stripe no está lista para cobrar.";
const NO_ACTIVE_METHOD = "La familia ya no tiene un método de pago activo.";
const PAYER_CHANGED = "Cambió la persona que paga la cuota.";
const BELOW_MINIMUM_TEXT = "Lo que queda por pagar es menos de 0,50 €, el mínimo que admite Stripe. Se cobra a mano.";
const METHOD_NOT_ACTIVE_TEXT = "Este tipo de pago no está activado en tu cuenta de Stripe. Se cobra a mano.";
/** La familia paga por domiciliación y la domiciliación todavía no se cobra sola. */
export const SEPA_NOT_ENABLED_TEXT = "Por ahora la domiciliación no se cobra sola. Se cobra a mano.";

const FAILURE_TEXT: Record<string, string> = {
  ...DECLINE_TEXT,
  payment_failed: "El banco ha rechazado el cobro.",
  requires_action: "El banco pide que la familia confirme el pago.",
  transient_exhausted: "No pudimos comprobar el cobro a tiempo.",
  invalid_service_period: "La cuota no tiene un periodo válido.",
  // Stripe no cobra menos de 0,50 €, ni sin el cliente o el método de pago de
  // la familia, ni con un tipo de pago que la cuenta de la academia no tiene activo.
  amount_below_minimum: BELOW_MINIMUM_TEXT,
  amount_too_small: BELOW_MINIMUM_TEXT,
  resource_missing: "Stripe ya no tiene el método de pago de la familia. Se cobra a mano.",
  account_invalid: `${STRIPE_NOT_READY} Se cobra a mano.`,
  payment_method_unactivated: METHOD_NOT_ACTIVE_TEXT,
  capability_not_active: METHOD_NOT_ACTIVE_TEXT,
  manual_payment: "Se registró un pago a mano.",
  reminder_sent: "Ya se avisó a la familia con un recordatorio de pago. Se cobra a mano.",
  canceled_by_academy: "Lo canceló la academia.",
  reviewed_by_academy: "La academia lo revisó y lo cerró.",
  [COLLECTION_WINDOW_EXPIRED_CODE]: NOT_ATTEMPTED_TEXT,
  // Puerta: bandera, entorno y tablas.
  flag_off: NOT_RELEASED,
  automation_not_released: NOT_RELEASED,
  environment_unknown: NOT_RELEASED,
  live_not_released: NOT_RELEASED,
  storage_missing: NOT_RELEASED,
  account_stale: "No pudimos comprobar tu cuenta de Stripe a tiempo.",
  // Plan de la academia.
  paid_plan_required: PLAN_REQUIRED,
  entitlement_missing: PLAN_NOT_ACTIVE,
  entitlement_not_effective: PLAN_NOT_ACTIVE,
  subscription_missing: SUBSCRIPTION_NOT_CURRENT,
  subscription_mismatch: SUBSCRIPTION_NOT_CURRENT,
  subscription_not_active: SUBSCRIPTION_NOT_CURRENT,
  subscription_period_not_current: SUBSCRIPTION_NOT_CURRENT,
  // Cuota, preferencia y familia.
  unsupported_currency: "Solo se cobran automáticamente las cuotas en euros.",
  organization_not_active: "La academia no está activa.",
  preference_manual: "La familia pasó a cobro manual.",
  preference_entitlement_stale:
    "Cambió el plan de la academia: hay que volver a activar el cobro automático de esta familia.",
  invoice_closed: "La cuota ya estaba pagada o anulada.",
  charge_void: "La cuota se anuló.",
  charge_settled: "La cuota ya estaba pagada.",
  plan_changed: "La cuota cambió después de programar el cobro.",
  charge_scope_mismatch: "La cuota cambió después de emitirse.",
  charge_manual: "La cuota pasó a cobro manual.",
  provider_scope_mismatch: STRIPE_NOT_READY,
  provider_environment_mismatch: STRIPE_NOT_READY,
  provider_api_generation_unsupported: STRIPE_NOT_READY,
  provider_charge_model_unsupported: STRIPE_NOT_READY,
  provider_not_ready: STRIPE_NOT_READY,
  authorization_missing: NO_ACTIVE_METHOD,
  authorization_scope_mismatch: NO_ACTIVE_METHOD,
  authorization_provider_mismatch: NO_ACTIVE_METHOD,
  authorization_inactive: NO_ACTIVE_METHOD,
  authorization_expired: NO_ACTIVE_METHOD,
  consent_incomplete: NO_ACTIVE_METHOD,
  payment_method_unknown: NO_ACTIVE_METHOD,
  authorization_changed: "La familia cambió su método de pago.",
  sepa_not_active: "La domiciliación no está activa en tu cuenta de Stripe.",
  // Decisión de Elvis del 17-11-2026: «Primero solo tarjeta».
  [SEPA_NOT_ENABLED_REASON]: SEPA_NOT_ENABLED_TEXT,
  charge_payer_mismatch: PAYER_CHANGED,
  payer_missing: PAYER_CHANGED,
  payer_not_current: PAYER_CHANGED,
};

const CHECK_IN_STRIPE = "Compruébalo en Stripe.";
const REVIEW_TEXT: Record<string, string> = {
  allocation: "Se cobró, pero no se pudo repartir entre las cuotas. Revisa los pagos de esta familia.",
  payment_recorded_for_other_attempt: `Este cobro ya estaba registrado en otra cuota. ${CHECK_IN_STRIPE}`,
  multiple_payments: `Hay más de un cobro para esta cuota. ${CHECK_IN_STRIPE}`,
  resume_exhausted: `No pudimos confirmar el resultado del cobro. ${CHECK_IN_STRIPE}`,
  attempt_unreadable: `No pudimos confirmar el resultado del cobro. ${CHECK_IN_STRIPE}`,
  idempotency_conflict: `No pudimos repetir el envío del cobro de forma segura. ${CHECK_IN_STRIPE}`,
  intent_mismatch: `El cobro de Stripe no coincide con el de esta cuota. ${CHECK_IN_STRIPE}`,
  payment_conflict: `El pago de Stripe no coincide con lo registrado en esta cuota. ${CHECK_IN_STRIPE}`,
  created_without_claim: `Hay un cobro en Stripe que Zaltyko no tenía registrado. ${CHECK_IN_STRIPE}`,
  attempts_exhausted: "Esta cuota ya no admite más intentos automáticos. Se cobra a mano.",
  stale_open: `El cobro lleva más de un día sin avanzar. ${CHECK_IN_STRIPE}`,
  processing_unreadable: `El cobro lleva más de 15 días en curso y no podemos ver su resultado. ${CHECK_IN_STRIPE}`,
  // Sin «Marcar como revisado» (la acción responde siempre 409): lo resuelve soporte.
  amount_mismatch:
    "Stripe cobró un importe distinto al de esta cuota y no lo hemos registrado. Resuélvelo en Stripe con su soporte.",
};

const REVIEW_FALLBACK = `El cobro necesita una comprobación. ${CHECK_IN_STRIPE}`;
const FAILURE_FALLBACK = "No se pudo cobrar automáticamente.";

/**
 * Motivo de un fallo, una cancelación o un bloqueo en palabras sencillas
 * (nunca el código). Un cierre `canceled` lleva su propio motivo en
 * `failure_code` (la academia, un pago a mano, la puerta, la ventana de
 * cobro…): manda sobre el `decline_code`, que es del fallo anterior.
 */
export function failureReasonText(input: {
  failureCode: string | null;
  declineCode: string | null;
  status?: string;
}): string {
  const byDecline = input.declineCode ? DECLINE_TEXT[input.declineCode] : undefined;
  const byFailure = input.failureCode ? FAILURE_TEXT[input.failureCode] : undefined;
  return (input.status === "canceled" ? (byFailure ?? byDecline) : (byDecline ?? byFailure)) ?? FAILURE_FALLBACK;
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
 *   todavía no lo ha intentado, dentro de la espera de los recordatorios);
 * - `processing`: la domiciliación ya está en el banco;
 * - `collected`: cobrada (`date`);
 * - `retry_scheduled`: falló y se reintentará (`date`);
 * - `manual`: el cobro pendiente ya no puede llegar (plan, preferencia o
 *   método de pago): «Se cobrará a mano», con el motivo;
 * - `failed`: falló sin reintento (o el reintento no llegó a tiempo); se cobra a mano;
 * - `canceled`: cancelado (por la puerta, la academia, un pago a mano o una revisión);
 * - `not_attempted`: pasó su día y la espera sin poder intentarlo (con o sin
 *   el intento `collection_window_expired` que lo cierra); se cobra a mano.
 */
export type OwnerAutomaticCollectionState =
  | "scheduled"
  | "in_progress"
  | "processing"
  | "collected"
  | "retry_scheduled"
  | "manual"
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
  /** Motivo en palabras sencillas: por qué falló, se canceló, se cobra a mano o hay que revisarlo. */
  reason: string | null;
  needsReview: boolean;
  /** «Cancelar el cobro automático» (reintento pendiente o cobro creado sin confirmar). */
  canCancel: boolean;
  /** «Marcar como revisado» (intento abierto con aviso, reanudaciones agotadas o más de 24 h sin cambios). */
  canMarkReviewed: boolean;
  /** Hay un intento en curso: el pago a mano responde 409 hasta que termine. */
  manualPaymentBlocked: boolean;
  /**
   * Aviso a la familia del primer cobro fallido (D3): `sent` si le llegó el
   * correo; `not_sent` si no se le pudo enviar (sin correo guardado o envío no
   * aceptado) y la academia debería avisarla; null si no hubo aviso.
   */
  familyNotice?: FamilyNoticeState | null;
}

export type FamilyNoticeState = "sent" | "not_sent";

/** Resultado guardado del aviso (family-failure-notice-store.ts) → lo que ve la academia. */
export function familyNoticeStateOf(outcome: string | null): FamilyNoticeState | null {
  if (outcome === "sent") return "sent";
  if (outcome === "no_email" || outcome === "not_delivered") return "not_sent";
  return null;
}

export interface OwnerAutomaticCollectionsView {
  /** Mes en curso en la zona de la academia, YYYY-MM. */
  month: string;
  items: OwnerAutomaticCollectionItem[];
  /** Hay más cobros de los que se enseñan. */
  truncated: boolean;
  /**
   * Con la bandera general apagada solo salen los cobros que ya estaban en
   * marcha (la pantalla lo dice en el título). Sin indicar: la lista normal.
   */
  inProgressOnly?: true;
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
  /** automaticCollectionBlocker: por qué el cobro pendiente ya no puede llegar. */
  blocker: string | null;
  /** Aviso de la factura `attempts_exhausted`: no admite más intentos automáticos. */
  attemptsExhausted: boolean;
  /** Resultado del aviso del primer fallo a la familia (familyNoticeStateOf), si lo hubo. */
  familyNotice?: FamilyNoticeState | null;
  attempt: {
    status: string;
    amountCents: number;
    failureCode: string | null;
    declineCode: string | null;
    nextRetryAt: Date | null;
    completedAt: Date | null;
    /** Último cambio del intento (`updated_at`). */
    updatedAt: Date | null;
    /** Cuándo se reclamó (`claimed_at`): mide cuánto lleva en curso. */
    claimedAt: Date | null;
    resumeCount: number;
    allocationStatus: string | null;
    hasReviewNotice: boolean;
    reviewReason: string | null;
  } | null;
}


/**
 * Un cobro de la lista de la academia, o `null` si no va en la lista. Pura.
 * Sin intento, sale la cuota cuyo día de cobro cae en el mes de la lista, la
 * que todavía está en su espera (aunque sea del mes anterior) y la que aún no
 * ha llegado en el mes en curso de la sede (la sede puede ir por detrás de la
 * academia cerca de medianoche). Con intento, sale siempre (la consulta ya
 * elige los del mes, los abiertos y los que tienen reintento).
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
  const blockerText = row.blocker ? failureReasonText({ failureCode: row.blocker, declineCode: null }) : null;
  try {
    const today = localCalendarDate(now, row.timezone);
    const attempt = row.attempt;
    if (!attempt) {
      const planned = plannedCollectionDate(row);
      if (!planned) return null;
      const expected = expectedCharge(planned, today);
      // Sale si es del mes de la lista, si aún está dentro de su espera (se
      // sigue cobrando, aunque sea del mes anterior) o si es del mes en curso
      // en la sede y todavía no ha llegado (la sede puede ir por detrás de la
      // academia cerca de medianoche). Una cuota ya pasada de ese mes de la
      // sede no se cuela: es de un mes que la academia ya cerró.
      const plannedMonth = planned.slice(0, 7);
      const listed =
        plannedMonth === month ||
        expected === "due" ||
        (plannedMonth === today.slice(0, 7) && expected === "scheduled");
      if (!listed) return null;
      const state: OwnerAutomaticCollectionState = blockerText
        ? "manual"
        : expected === "scheduled"
          ? "scheduled"
          : expected === "due"
            ? "in_progress"
            : "not_attempted";
      return {
        ...base,
        amountCents: row.openAutomaticCents,
        state,
        date: planned,
        reason: blockerText ?? (state === "not_attempted" ? NOT_ATTEMPTED_TEXT : null),
        needsReview: false,
        canCancel: false,
        canMarkReviewed: false,
        manualPaymentBlocked: false,
      };
    }

    const open = OPEN_STATUSES.has(attempt.status);
    // Una domiciliación en el banco sin aviso ni reanudaciones agotadas no se
    // ofrece para revisar aunque pasen 15 días: el proceso diario la puede
    // leer (si no, ya habría dejado el aviso `processing_unreadable`) y sigue
    // en curso, así que «Marcar como revisado» respondería que no se puede
    // cancelar. La acción mantiene su propia regla y vuelve a leer Stripe.
    const stillInBank =
      attempt.status === "processing" &&
      !attempt.hasReviewNotice &&
      attempt.resumeCount < FAMILY_COLLECTION_MAX_RESUMES;
    // Stripe cobró otro importe u otra moneda: el dinero se movió y no cuadra.
    // «Marcar como revisado» y «Cancelar» responderían siempre 409 (soporte),
    // así que no se ofrecen; la fila sigue pidiendo revisión con su motivo.
    const needsSupport = open && attempt.hasReviewNotice && attempt.reviewReason === AMOUNT_MISMATCH_REASON;
    const canMarkReviewed = !stillInBank && !needsSupport && academyCanMarkReviewed(attempt, now);
    const allocationReview = attempt.status === "succeeded" && attempt.allocationStatus === "needs_review";
    // Aviso de la factura: ya no admite más intentos automáticos (se cobra a mano).
    const exhausted = row.attemptsExhausted && !open;
    const needsReview = canMarkReviewed || needsSupport || allocationReview || exhausted;
    const reviewText = allocationReview
      ? reviewReasonText("allocation")
      : canMarkReviewed || needsSupport
        ? reviewReasonText(
            attempt.reviewReason ??
              (attempt.hasReviewNotice
                ? null
                : attempt.resumeCount >= FAMILY_COLLECTION_MAX_RESUMES
                  ? "resume_exhausted"
                  : "stale_open")
          )
        : null;
    const failureText = exhausted
      ? `${failureReasonText(attempt)} ${reviewReasonText("attempts_exhausted")}`
      : failureReasonText(attempt);
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
        reason =
          reviewText ??
          (isLongProcessingAttempt(attempt, now)
            ? "La domiciliación sigue en el banco."
            : "La domiciliación está en el banco; tarda unos días.");
        break;
      case "claimed":
      case "created":
        state = "in_progress";
        break;
      case "failed": {
        // Sin más intentos, el reintento guardado ya no sale.
        const retryDate = exhausted ? null : local(attempt.nextRetryAt);
        const expected = retryDate ? expectedCharge(retryDate, today) : "lapsed";
        if (retryDate && blockerText) {
          // El reintento ya no puede salir (la puerta lo cancelará): se cobra a mano.
          state = "manual";
          date = retryDate;
          reason = `${failureText} ${blockerText}`;
        } else if (retryDate && expected !== "lapsed") {
          state = expected === "scheduled" ? "retry_scheduled" : "in_progress";
          date = retryDate;
          reason = failureText;
        } else {
          state = "failed";
          date = local(attempt.completedAt);
          reason = failureText;
        }
        break;
      }
      default:
        // La ventana de cobro pasó sin poder cobrar: para la academia es lo
        // mismo que una cuota que no llegó a intentarse.
        state = attempt.failureCode === COLLECTION_WINDOW_EXPIRED_CODE ? "not_attempted" : "canceled";
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
      // Con el importe que no cuadra, cancelar también respondería 409 (soporte).
      canCancel:
        !needsSupport &&
        (attempt.status === "created" || (attempt.status === "failed" && attempt.nextRetryAt !== null)),
      canMarkReviewed,
      manualPaymentBlocked: open,
      // Una cuota ya cobrada no necesita recordar el aviso.
      familyNotice: state === "collected" ? null : (row.familyNotice ?? null),
    };
  } catch {
    return null;
  }
}

/** Cobros que se enseñan como mucho; el resto, en Stripe o en las cuotas. */
export const OWNER_AUTOMATIC_COLLECTIONS_LIMIT = 100;

/**
 * Filas que se piden a la base como mucho antes de elegir las que salen en la
 * lista. Más que OWNER_AUTOMATIC_COLLECTIONS_LIMIT: la ventana incluye el mes
 * anterior, y sus cuotas ya pasadas (que no salen) no deben quitar sitio a
 * las que sí importan, como un cobro antiguo que sigue en curso.
 */
export const OWNER_AUTOMATIC_COLLECTIONS_FETCH_LIMIT = 500;

/**
 * Cobros automáticos del mes de la academia: los intentados este mes, los
 * que siguen abiertos o con reintento pendiente (aunque empezaran antes) y
 * las cuotas automáticas sin intento que van en la lista según
 * ownerAutomaticCollectionItemOf: su día de cobro cae en este mes, siguen en
 * su espera (aunque sean del mes anterior) o aún no han llegado en el mes en
 * curso de su sede. Solo propiedad, o administración con todas las sedes (las
 * mismas personas que pueden cancelar o marcar como revisado); para el resto,
 * `null`.
 *
 * Con la bandera apagada (y los cerrojos de R11 abiertos) solo salen los
 * cobros que ya están en marcha (`claimed`, `created`, `processing`), con
 * «Marcar como revisado» si procede: el proceso diario los sigue poniendo al
 * día y el pago a mano está bloqueado mientras tanto, así que la academia
 * necesita verlos. Sin ninguno, `null`. Con los cerrojos cerrados, nada.
 *
 * La consulta parte de un conjunto acotado de facturas candidatas (intentos
 * de la academia en la ventana del mes, abiertos o con reintento, y cuotas
 * automáticas abiertas que vencen en la ventana): nunca recorre todo el
 * historial de facturas.
 */
export async function getOwnerAutomaticCollections(input: {
  userId: string;
  organizationId: string;
  now?: Date;
}): Promise<OwnerAutomaticCollectionsView | null> {
  const userId = uuidSchema.parse(input.userId);
  const organizationIdInput = uuidSchema.parse(input.organizationId);
  if (!areFamilyCollectionLocksOpen()) return null;
  // Bandera apagada: solo los cobros en marcha.
  const inProgressOnly = !isFamilyAutomaticCollectionOpen();
  const scope = await resolveOwnerScope({ userId, organizationId: organizationIdInput });
  const allowed =
    scope.member.role === "owner" ||
    (scope.member.role === "admin" && scope.member.locationScopeMode === "all");
  if (!allowed) return null;
  if (!(await collectionTablesAvailable())) return null;
  const remindersTable = !inProgressOnly && (await isPaymentRemindersTablePresent(db));

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
  // Desde el mes anterior: una cuota de ese mes puede seguir en su espera
  // (con día fijo, su vencimiento puede ser de principios de mes). Margen de
  // dos días a cada lado: el mes se decide luego con la zona de cada sede.
  const previousMonthStart = addLocalDays(monthStart, -1).slice(0, 7) + "-01";
  const windowStart = startOfLocalDay(addLocalDays(previousMonthStart, -2), organizationTimezone).toISOString();
  const windowEnd = startOfLocalDay(addLocalDays(nextMonthStart, 2), organizationTimezone).toISOString();
  const monthStartInstant = startOfLocalDay(monthStart, organizationTimezone).toISOString();
  const nextMonthInstant = startOfLocalDay(nextMonthStart, organizationTimezone).toISOString();

  // Con la bandera apagada, solo facturas con un intento en marcha (el abierto
  // es siempre el último de su factura).
  const attemptCandidate = inProgressOnly
    ? sql`a.status in ('claimed', 'created', 'processing')`
    : sql`(
           (a.claimed_at >= ${monthStartInstant}::timestamptz and a.claimed_at < ${nextMonthInstant}::timestamptz)
           or a.status in ('claimed', 'created', 'processing')
           or (a.status = 'failed' and a.next_retry_at is not null)
         )`;
  const chargeCandidates = inProgressOnly
    ? sql``
    : sql`
      union
      select c.invoice_id
        from zaltyko.charges c
       where c.organization_id = ${organizationId}::uuid
         and c.collection_mode::text = 'automatic'
         and c.status::text in ('due', 'partially_paid')
         and c.due_at >= ${windowStart}::timestamptz
         and c.due_at < ${windowEnd}::timestamptz`;
  const listedRow = inProgressOnly
    ? sql`la.status in ('claimed', 'created', 'processing')`
    : sql`(
        (
          la.id is not null
          and (
            (la.claimed_at >= ${monthStartInstant}::timestamptz and la.claimed_at < ${nextMonthInstant}::timestamptz)
            or la.status in ('claimed', 'created', 'processing')
            or (la.status = 'failed' and la.next_retry_at is not null)
          )
        )
        or (la.id is null and i.status::text in ('issued', 'partially_paid'))
      )`;

  const result = await db.execute(sql`
    with candidates as (
      select a.invoice_id
        from zaltyko.family_collection_attempts a
       where a.organization_id = ${organizationId}::uuid
         and ${attemptCandidate}${chargeCandidates}
    )
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
      ${prerequisiteColumns(remindersTable)},
      la.status as "attemptStatus",
      la.amount_cents::text as "attemptAmountCents",
      la.failure_code as "failureCode",
      la.decline_code as "declineCode",
      la.next_retry_at as "nextRetryAt",
      la.completed_at as "completedAt",
      la.updated_at as "attemptUpdatedAt",
      la.claimed_at as "attemptClaimedAt",
      la.resume_count as "resumeCount",
      la.allocation_status as "allocationStatus",
      la.review_reason as "reviewReason",
      la.has_review_notice as "hasReviewNotice",
      exists (
        select 1
          from zaltyko.outbox_events e
         where e.organization_id = i.organization_id
           and e.event_name = ${NEEDS_REVIEW_EVENT}
           and e.idempotency_key = 'family-collection:invoice:' || i.id::text || ':needs_review:attempts_exhausted'
      ) as "attemptsExhausted",
      (
        select e.payload ->> 'outcome'
          from zaltyko.outbox_events e
         where e.organization_id = i.organization_id
           and e.event_name = ${FAMILY_FAILURE_NOTICE_RESULT_EVENT}
           and e.payload ->> 'invoiceId' = i.id::text
         order by e.occurred_at desc
         limit 1
      ) as "familyNoticeOutcome"
    from (select distinct invoice_id from candidates) k
    join zaltyko.invoices i
      on i.organization_id = ${organizationId}::uuid and i.id = k.invoice_id
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
             a.next_retry_at, a.completed_at, a.claimed_at, a.updated_at, a.resume_count,
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
    where i.status::text <> 'draft'
      and ${listedRow}
    order by coalesce(la.claimed_at, i.due_at) desc, i.reference asc
    limit ${OWNER_AUTOMATIC_COLLECTIONS_FETCH_LIMIT + 1}
  `);

  const rows = result.rows as Array<Record<string, unknown>>;
  // Un cobro en marcha no depende del plan (solo lo usan las filas sin intento o con reintento).
  const plan = rows.length > 0 && !inProgressOnly ? await loadPlan(organizationId, now) : null;
  // Primero se eligen las filas que van en la lista y después se corta: el
  // corte nunca deja fuera una fila que sale por otra que no sale.
  const listed = rows.slice(0, OWNER_AUTOMATIC_COLLECTIONS_FETCH_LIMIT).flatMap((row) => {
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
        blocker: plan ? automaticCollectionBlocker(prerequisitesOf(row, plan)) : null,
        attemptsExhausted: row.attemptsExhausted === true,
        familyNotice: familyNoticeStateOf(textOrNull(row.familyNoticeOutcome)),
        attempt: attemptStatus
          ? {
              status: attemptStatus,
              amountCents: cents(row.attemptAmountCents),
              failureCode: textOrNull(row.failureCode),
              declineCode: textOrNull(row.declineCode),
              nextRetryAt: dateOrNull(row.nextRetryAt),
              completedAt: dateOrNull(row.completedAt),
              updatedAt: dateOrNull(row.attemptUpdatedAt),
              claimedAt: dateOrNull(row.attemptClaimedAt),
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
    // Con la bandera apagada, solo lo que está en marcha (por si la consulta trajera otra cosa).
    return item && (!inProgressOnly || item.manualPaymentBlocked) ? [item] : [];
  });
  if (inProgressOnly && listed.length === 0) return null;
  return {
    month,
    items: listed.slice(0, OWNER_AUTOMATIC_COLLECTIONS_LIMIT),
    truncated: listed.length > OWNER_AUTOMATIC_COLLECTIONS_LIMIT || rows.length > OWNER_AUTOMATIC_COLLECTIONS_FETCH_LIMIT,
    ...(inProgressOnly ? { inProgressOnly: true as const } : {}),
  };
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

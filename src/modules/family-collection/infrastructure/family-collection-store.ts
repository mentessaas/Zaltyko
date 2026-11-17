/**
 * Cobro automático de cuotas (Fase 3): acceso a la base del proceso diario de
 * cobro.
 *
 * Toca las tablas del candidato
 * docs/deployment/candidates/20261117120000_family_collection_candidate.sql
 * (sin aplicar) y columnas de las candidatas de las Fases 1 y 2, así que todo
 * va en SQL con columnas explícitas y solo debe usarse después de
 * `isStorageAvailable()`.
 *
 * Reglas que cumple cada escritura:
 * - una sola transacción corta por método, sin llamadas a Stripe dentro (los
 *   métodos no reciben nada que pueda llamar a Stripe; `claimOrCancel` solo
 *   recibe una decisión pura);
 * - orden de bloqueo único: fila de `organizations`
 *   (lockOrganizationForSaasMutation) → cuotas por id → factura → intento;
 * - solo ids, referencias opacas (`pi_…`) y códigos de Stripe en la base, la
 *   auditoría y el outbox.
 *
 * Las decisiones de negocio (plan, puerta, reintentos) viven en el servicio.
 */
import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import type { DatabaseClient, TransactionClient } from "@/lib/db-transactions";
import { logger } from "@/lib/logger";
import {
  allocateProviderCollectionPayment,
  recordProviderCollectionPayment,
  type ProviderCollectionAllocationResult,
} from "@/modules/billing/application/ledger-service";
import {
  loadOrganizationPlanState,
  loadPlanChangeRevision,
  type OrganizationPlanState,
} from "@/modules/billing/application/plan-state";
import type { CollectionPlanChargeStatus, CollectionPlanInvoiceStatus } from "@/modules/family-collection/domain/collection-plan";
import type {
  FamilyCollectionGateAccount,
  FamilyCollectionGateAuthorization,
  FamilyCollectionGatePayer,
} from "@/modules/family-collection/domain/collection-gate";
import {
  AMOUNT_MISMATCH_REASON,
  receivedMatches,
  type ReceivedAmount,
} from "@/modules/family-collection/domain/payment-outcome";
import { isFamilyCollectionStorageAvailable } from "@/modules/family-collection/application/storage";
import { findCollectionSettings } from "@/modules/family-collection/infrastructure/collection-settings-store";
import {
  FAMILY_COLLECTION_MAX_RESUMES,
  type FamilyCollectionAllocationStatus,
  type FamilyCollectionAttemptStatus,
} from "@/modules/family-collection/infrastructure/family-collection-schema";
import { isFamilyPaymentMethodsStorageAvailable } from "@/modules/family-payment-methods/application/storage";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";
import { lockOrganizationForSaasMutation } from "@/modules/saas-billing/application/entitlement-service";
import { FAMILY_COLLECTION_JOB_KEY } from "@/modules/shared/application/actor";
import {
  appendAuditEntry,
  appendOutboxEvent,
  findOutboxEvent,
} from "@/modules/shared/infrastructure/transactional-records";

type Executor = Pick<DatabaseClient, "execute">;

export type CollectionMethodKind = "card" | "sepa_debit";

/** Estados en los que un intento todavía puede avanzar. */
const OPEN_STATUSES = ["claimed", "created", "processing"] as const;

const SYSTEM_AUDIT_METADATA = {
  actor_type: "system",
  job_key: FAMILY_COLLECTION_JOB_KEY,
} as const;

/** Evento del outbox con el que la academia recibe un aviso para revisar un cobro. */
export const NEEDS_REVIEW_EVENT = "family_collection.needs_review";

/**
 * Clave de un aviso de revisión: una por intento (o por factura, si no hay
 * intento) y motivo. La comparten applyOutcome, recordNotice y la red de
 * seguridad de la Fase A.
 */
export function needsReviewKey(input: { attemptId: string | null; invoiceId: string; reason: string }): string {
  return input.attemptId
    ? `family-collection:${input.attemptId}:needs_review:${input.reason}`
    : `family-collection:invoice:${input.invoiceId}:needs_review:${input.reason}`;
}

/**
 * Academias a las que se limita un recorrido; `null` = todas. Solo lo usan
 * los tests de PostgreSQL para no tocar datos de otras suites: el código de
 * producción nunca lo pasa.
 */
export type OrganizationScope = readonly string[] | null;

/** Condición SQL «la academia está en el alcance» (sin alcance, siempre cierta). */
function inScope(column: SQL, scope: OrganizationScope): SQL {
  if (scope === null) return sql`true`;
  // Lista como texto: Drizzle expandiría un array en una lista de parámetros.
  return sql`${column} = any(string_to_array(${scope.join(",")}, ',')::uuid[])`;
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface CollectionAttempt {
  id: string;
  organizationId: string;
  locationId: string;
  invoiceId: string;
  familyId: string;
  familyPayerId: string | null;
  authorizationId: string | null;
  paymentProviderAccountId: string | null;
  attemptNumber: number;
  paymentMethodKind: CollectionMethodKind | null;
  amountCents: number;
  currency: string;
  status: FamilyCollectionAttemptStatus;
  paymentIntentId: string | null;
  resumeCount: number;
  claimedAt: Date;
}

/**
 * Intento tomado por claimResumable, con lo necesario para devolverle la
 * reanudación si la ejecución no llega a procesarlo (releaseResume).
 * `resumeCount` ya incluye la reanudación tomada.
 */
export interface ResumedAttempt extends CollectionAttempt {
  resumeClaim: {
    /** `updated_at` que escribió la toma (el `now` de la ejecución). */
    takenAt: Date;
    /** `updated_at` de antes de la toma, como texto de PostgreSQL (sin perder microsegundos). */
    previousUpdatedAt: string;
  };
}

export interface CollectionAllocationRow {
  chargeId: string;
  amountCents: number;
}

/** Lo que necesita Stripe para crear, confirmar o releer el cobro de un intento. */
export interface AttemptStripeRefs {
  /** `acct_…` de la cuenta del intento. */
  connectedAccount: string;
  /** `cus_…` de la autorización (exactamente un intento de preparación), o null. */
  customer: string | null;
  paymentMethod: string | null;
  /** Orden SEPA de la autorización; null con tarjeta. */
  mandate: string | null;
  /** Zona horaria de la sede de la factura. */
  timezone: string;
  /** Primer día del periodo de las cuotas del intento (YYYY-MM-DD). */
  servicePeriodStart: string | null;
  /**
   * `claimed_at` del intento 1 de la factura: las fechas de los reintentos de
   * tarjeta se cuentan desde su día local (retry-policy.ts). null si no se
   * encuentra (entonces no se programa ningún reintento).
   */
  firstAttemptClaimedAt: Date | null;
  allocations: CollectionAllocationRow[];
}

export interface CollectionChargeRow {
  id: string;
  organizationId: string;
  invoiceId: string;
  familyId: string;
  familyPayerId: string | null;
  collectionMode: "manual" | "automatic";
  status: CollectionPlanChargeStatus;
  currency: string;
  amountCents: number;
  /** Importe menos lo ya repartido a la cuota. */
  outstandingCents: number;
  dueAt: Date;
  servicePeriodStart: string;
}

export interface CollectionInvoiceRow {
  id: string;
  organizationId: string;
  locationId: string;
  familyId: string;
  familyPayerId: string | null;
  status: CollectionPlanInvoiceStatus;
  currency: string;
  /** Todas sus líneas son de cuota mensual (`monthly-invoice/issue.ts`). */
  isMonthly: boolean;
  timezone: string;
}

export interface AttemptHistory {
  /** Hay un intento `claimed`, `created` o `processing`. */
  openExists: boolean;
  /** Último intento (por número), o null si la factura no tiene ninguno. */
  last: { attemptNumber: number; status: FamilyCollectionAttemptStatus; nextRetryAt: Date | null } | null;
}

export type CollectionAccountRow = FamilyCollectionGateAccount & { providerAccountReference: string };
export type CollectionAuthorizationRow = FamilyCollectionGateAuthorization & { id: string };

/** Todo lo que la puerta necesita de una factura, leído sin transacción. */
export interface InvoiceCollectionContext {
  invoice: CollectionInvoiceRow;
  charges: CollectionChargeRow[];
  organization: { id: string; status: "trial" | "active" | "suspended" | "closed" };
  plan: OrganizationPlanState;
  planChangeRevision: number | null;
  preference: { requestedMode: "manual" | "automatic"; entitlementRevision: number | null } | null;
  collectionDayOfMonth: number | null;
  account: CollectionAccountRow | null;
  authorization: CollectionAuthorizationRow | null;
  customerReference: string | null;
  payer: FamilyCollectionGatePayer | null;
  history: AttemptHistory;
}

/** Foto bloqueada de la factura dentro de la transacción de reclamar o cancelar. */
export interface LockedInvoiceSnapshot {
  invoice: CollectionInvoiceRow;
  charges: CollectionChargeRow[];
  history: AttemptHistory;
  /** La autorización pedida, releída en la transacción (cualquier estado), o null. */
  authorization: {
    id: string;
    organizationId: string;
    familyId: string;
    familyPayerId: string;
    paymentProviderAccountId: string;
    status: string;
  } | null;
}

export type ClaimDecision =
  | { action: "skip"; reason: string }
  | {
      action: "claimed" | "canceled";
      attemptNumber: number;
      amountCents: number;
      allocations: CollectionAllocationRow[];
      /** Motivo de la puerta; solo en `canceled`. */
      reason?: string;
    };

export interface ClaimOrCancelInput {
  organizationId: string;
  invoiceId: string;
  /** Solo en `claimed`: con qué se cobra. En `canceled` se guardan solo si se pasan. */
  authorizationId: string | null;
  paymentProviderAccountId: string | null;
  paymentMethodKind: CollectionMethodKind | null;
  now: Date;
}

export type ClaimOrCancelResult =
  | { outcome: "skipped"; reason: string }
  | { outcome: "claimed"; attempt: CollectionAttempt; allocations: CollectionAllocationRow[] }
  | { outcome: "canceled"; attempt: CollectionAttempt };

export type AttemptOutcome =
  /** `received`: lo que Stripe dice que cobró; si no cuadra con el intento, no se registra. */
  | { kind: "succeeded"; paymentIntentId: string; received: ReceivedAmount }
  | { kind: "processing"; paymentIntentId: string }
  | {
      kind: "failed";
      paymentIntentId: string | null;
      code: string;
      declineCode: string | null;
      nextRetryAt: Date | null;
    }
  | { kind: "canceled"; paymentIntentId: string | null; reason: string };

export type ApplyOutcomeResult =
  /** El intento ya no estaba abierto, o (con `review`) necesita que lo revise una persona. */
  | { applied: false; review?: string }
  | {
      applied: true;
      status: FamilyCollectionAttemptStatus;
      allocationStatus: FamilyCollectionAllocationStatus | null;
      reviewReasons: string[];
    };

export interface DueInvoiceRef {
  invoiceId: string;
  organizationId: string;
}

export interface FamilyCollectionStore {
  /** Tablas de las Fases 1, 2 y 3 tal como las definen sus candidatas. */
  isStorageAvailable(): Promise<boolean>;
  /**
   * Facturas candidatas a cobrar (filtro grueso; el servicio decide por fecha
   * local): con cuotas automáticas abiertas que vencen antes de `horizon`, sin
   * intento abierto y cuyo último intento falló con reintento antes de
   * `horizon`, o sin intentos. Por orden de id, después de `after`.
   */
  listDueInvoices(input: {
    after: string | null;
    limit: number;
    horizon: Date;
    scope: OrganizationScope;
  }): Promise<DueInvoiceRef[]>;
  loadInvoiceContext(input: {
    organizationId: string;
    invoiceId: string;
    environment: "test" | "live";
    now: Date;
  }): Promise<InvoiceCollectionContext | null>;
  /**
   * Una transacción: bloquea academia → cuotas → factura, relee la factura y
   * la autorización, pide la decisión (pura) y escribe el intento `claimed`
   * con su reparto, o el intento `canceled` de la puerta.
   */
  claimOrCancel(
    input: ClaimOrCancelInput,
    decide: (snapshot: LockedInvoiceSnapshot) => ClaimDecision
  ): Promise<ClaimOrCancelResult>;
  /** `claimed` → `created` con su `pi_…`. `false` si el intento ya no estaba `claimed`. */
  markCreated(input: { organizationId: string; attemptId: string; paymentIntentId: string; now: Date }): Promise<boolean>;
  /**
   * Aplica el resultado a un intento todavía abierto; si ya no lo está, no
   * hace nada. Un `succeeded` cuyo importe o moneda no cuadran con el intento
   * no registra el pago: deja el aviso `amount_mismatch` y devuelve
   * `{ applied: false, review: "amount_mismatch" }`.
   */
  applyOutcome(input: {
    organizationId: string;
    attemptId: string;
    outcome: AttemptOutcome;
    environment: "test" | "live";
    now: Date;
  }): Promise<ApplyOutcomeResult>;
  /**
   * Toma de forma atómica los intentos `claimed`/`created` sin cambios desde
   * antes de `staleBefore` (`updated_at`) con menos de
   * FAMILY_COLLECTION_MAX_RESUMES reanudaciones, y les suma una (y pone
   * `updated_at` a `now`).
   */
  claimResumable(input: {
    staleBefore: Date;
    after: string | null;
    limit: number;
    now: Date;
    scope: OrganizationScope;
  }): Promise<ResumedAttempt[]>;
  /**
   * Devuelve la reanudación a un intento tomado que la ejecución no llegó a
   * procesar (se acabó su tiempo): resta la reanudación y deja `updated_at`
   * como estaba antes de la toma. Solo si nadie lo tocó desde la toma (sigue
   * reclamado o creado, con las mismas reanudaciones y el `updated_at` de la
   * toma). Transacción corta con el orden único de bloqueo. `true` si la devolvió.
   */
  releaseResume(attempt: ResumedAttempt): Promise<boolean>;
  listProcessing(input: { after: string | null; limit: number; scope: OrganizationScope }): Promise<CollectionAttempt[]>;
  /**
   * Red de seguridad: intentos `claimed`/`created` que ya agotaron sus
   * reanudaciones y todavía no tienen el aviso `resume_exhausted`.
   */
  listExhaustedWithoutNotice(input: {
    after: string | null;
    limit: number;
    scope: OrganizationScope;
  }): Promise<CollectionAttempt[]>;
  loadAttemptRefs(attempt: CollectionAttempt): Promise<AttemptStripeRefs | null>;
  /**
   * Aviso a la academia para revisar un intento, o una factura si no hay
   * intento (una vez por intento o factura y motivo). `true` si lo escribió.
   */
  recordNotice(input: {
    organizationId: string;
    locationId: string;
    attemptId: string | null;
    invoiceId: string;
    reason: string;
    now: Date;
  }): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Conversión de filas
// ---------------------------------------------------------------------------

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function toDateOrNull(value: unknown): Date | null {
  return value === null || value === undefined ? null : toDate(value);
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toCents(value: unknown): number {
  const cents = Number(value);
  if (!Number.isSafeInteger(cents)) throw new Error("FAMILY_COLLECTION_INVALID_AMOUNT");
  return cents;
}

/** Código de un error para el registro (OperationalError o PostgreSQL), nunca su mensaje. */
function errorCodeOf(error: unknown): string | null {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
  return typeof code === "string" && /^[A-Za-z0-9_]{1,64}$/.test(code) ? code : null;
}

/** Los códigos se guardan como los define la base: minúsculas, dígitos y guion bajo. */
function storedCode(code: string): string {
  return code.toLowerCase();
}

function toKind(value: unknown): CollectionMethodKind | null {
  return value === "card" || value === "sepa_debit" ? value : null;
}

const attemptColumns = sql`
  id::text as "id",
  organization_id::text as "organizationId",
  location_id::text as "locationId",
  invoice_id::text as "invoiceId",
  family_id::text as "familyId",
  family_payer_id::text as "familyPayerId",
  authorization_id::text as "authorizationId",
  payment_provider_account_id::text as "paymentProviderAccountId",
  attempt_number as "attemptNumber",
  payment_method_kind as "paymentMethodKind",
  amount_cents::text as "amountCents",
  currency as "currency",
  status as "status",
  provider_payment_intent_reference as "paymentIntentId",
  resume_count as "resumeCount",
  claimed_at as "claimedAt"
`;

function toAttempt(row: Record<string, unknown>): CollectionAttempt {
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    locationId: String(row.locationId),
    invoiceId: String(row.invoiceId),
    familyId: String(row.familyId),
    familyPayerId: toStringOrNull(row.familyPayerId),
    authorizationId: toStringOrNull(row.authorizationId),
    paymentProviderAccountId: toStringOrNull(row.paymentProviderAccountId),
    attemptNumber: Number(row.attemptNumber),
    paymentMethodKind: toKind(row.paymentMethodKind),
    amountCents: toCents(row.amountCents),
    currency: String(row.currency),
    status: String(row.status) as FamilyCollectionAttemptStatus,
    paymentIntentId: toStringOrNull(row.paymentIntentId),
    resumeCount: Number(row.resumeCount),
    claimedAt: toDate(row.claimedAt),
  };
}

const openStatusList = sql.join(
  OPEN_STATUSES.map((status) => sql`${status}`),
  sql`, `
);

// ---------------------------------------------------------------------------
// Lecturas (sin transacción o dentro de la de quien llama)
// ---------------------------------------------------------------------------

async function readInvoice(executor: Executor, organizationId: string, invoiceId: string): Promise<{
  invoice: CollectionInvoiceRow;
  organizationStatus: InvoiceCollectionContext["organization"]["status"];
} | null> {
  const result = await executor.execute(sql`
    select i.id::text as "id",
           i.organization_id::text as "organizationId",
           i.location_id::text as "locationId",
           i.family_id::text as "familyId",
           i.family_payer_id::text as "familyPayerId",
           i.status::text as "status",
           i.currency as "currency",
           l.timezone as "timezone",
           o.status::text as "organizationStatus",
           (
             exists (
               select 1 from zaltyko.invoice_lines il
                where il.organization_id = i.organization_id and il.invoice_id = i.id
             )
             and not exists (
               select 1 from zaltyko.invoice_lines il
                where il.organization_id = i.organization_id and il.invoice_id = i.id
                  and il.line_type <> 'monthly_fee'
             )
           ) as "isMonthly"
      from zaltyko.invoices i
      join zaltyko.organizations o on o.id = i.organization_id
      join zaltyko.locations l on l.organization_id = i.organization_id and l.id = i.location_id
     where i.organization_id = ${organizationId}::uuid
       and i.id = ${invoiceId}::uuid
     limit 1
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    invoice: {
      id: String(row.id),
      organizationId: String(row.organizationId),
      locationId: String(row.locationId),
      familyId: String(row.familyId),
      familyPayerId: toStringOrNull(row.familyPayerId),
      status: String(row.status) as CollectionPlanInvoiceStatus,
      currency: String(row.currency),
      isMonthly: row.isMonthly === true,
      timezone: String(row.timezone),
    },
    organizationStatus: String(row.organizationStatus) as InvoiceCollectionContext["organization"]["status"],
  };
}

async function readCharges(executor: Executor, organizationId: string, invoiceId: string): Promise<CollectionChargeRow[]> {
  const result = await executor.execute(sql`
    select c.id::text as "id",
           c.organization_id::text as "organizationId",
           c.invoice_id::text as "invoiceId",
           c.family_id::text as "familyId",
           c.family_payer_id::text as "familyPayerId",
           c.collection_mode::text as "collectionMode",
           c.status::text as "status",
           c.currency as "currency",
           c.amount_cents::text as "amountCents",
           (c.amount_cents - coalesce((
             select sum(pa.amount_cents)
               from zaltyko.payment_allocations pa
              where pa.organization_id = c.organization_id and pa.charge_id = c.id
           ), 0))::text as "outstandingCents",
           c.due_at as "dueAt",
           -- Formato fijo YYYY-MM-DD, sin depender de DateStyle.
           to_char(c.service_period_start, 'YYYY-MM-DD') as "servicePeriodStart"
      from zaltyko.charges c
     where c.organization_id = ${organizationId}::uuid
       and c.invoice_id = ${invoiceId}::uuid
     order by c.id
  `);
  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    organizationId: String(row.organizationId),
    invoiceId: String(row.invoiceId),
    familyId: String(row.familyId),
    familyPayerId: toStringOrNull(row.familyPayerId),
    collectionMode: row.collectionMode === "automatic" ? "automatic" : "manual",
    status: String(row.status) as CollectionPlanChargeStatus,
    currency: String(row.currency),
    amountCents: toCents(row.amountCents),
    outstandingCents: toCents(row.outstandingCents),
    dueAt: toDate(row.dueAt),
    servicePeriodStart: String(row.servicePeriodStart),
  }));
}

async function readHistory(executor: Executor, organizationId: string, invoiceId: string): Promise<AttemptHistory> {
  const result = await executor.execute(sql`
    select exists (
             select 1 from zaltyko.family_collection_attempts a
              where a.organization_id = ${organizationId}::uuid
                and a.invoice_id = ${invoiceId}::uuid
                and a.status in (${openStatusList})
           ) as "openExists",
           last.attempt_number as "attemptNumber",
           last.status as "status",
           last.next_retry_at as "nextRetryAt"
      from (select 1) as one
      left join lateral (
        select a.attempt_number, a.status, a.next_retry_at
          from zaltyko.family_collection_attempts a
         where a.organization_id = ${organizationId}::uuid
           and a.invoice_id = ${invoiceId}::uuid
         order by a.attempt_number desc
         limit 1
      ) as last on true
  `);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  return {
    openExists: row.openExists === true,
    last:
      row.attemptNumber === null || row.attemptNumber === undefined
        ? null
        : {
            attemptNumber: Number(row.attemptNumber),
            status: String(row.status) as FamilyCollectionAttemptStatus,
            nextRetryAt: toDateOrNull(row.nextRetryAt),
          },
  };
}

async function readAccount(
  executor: Executor,
  organizationId: string,
  environment: "test" | "live"
): Promise<CollectionAccountRow | null> {
  const result = await executor.execute(sql`
    select id::text as "id",
           organization_id::text as "organizationId",
           processor as "processor",
           environment::text as "environment",
           provider_account_reference as "providerAccountReference",
           accounts_api_generation as "accountsApiGeneration",
           charge_model as "chargeModel",
           status::text as "status",
           card_payments_capability_status as "cardPaymentsCapabilityStatus",
           sepa_debit_payments_capability_status as "sepaDebitPaymentsCapabilityStatus",
           last_synced_at as "lastSyncedAt"
      from zaltyko.organization_payment_provider_accounts
     where organization_id = ${organizationId}::uuid
       and processor = 'stripe'
       and environment = ${environment}::zaltyko.stripe_environment
     limit 1
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    processor: String(row.processor),
    environment: String(row.environment) as "test" | "live",
    providerAccountReference: String(row.providerAccountReference),
    accountsApiGeneration: Number(row.accountsApiGeneration),
    chargeModel: String(row.chargeModel),
    status: String(row.status),
    cardPaymentsCapabilityStatus: String(row.cardPaymentsCapabilityStatus),
    sepaDebitPaymentsCapabilityStatus: String(row.sepaDebitPaymentsCapabilityStatus),
    lastSyncedAt: toDateOrNull(row.lastSyncedAt),
  };
}

/**
 * Autorización activa del pagador en la cuenta y su Customer: el de su único
 * intento de preparación, si ese intento es del mismo pagador y cuenta. Con
 * cero o varios intentos, el Customer es null (la puerta lo trata como final).
 */
async function readActiveAuthorization(
  executor: Executor,
  input: { organizationId: string; accountId: string; familyPayerId: string }
): Promise<{ authorization: CollectionAuthorizationRow; customerReference: string | null } | null> {
  const result = await executor.execute(sql`
    select a.id::text as "id",
           a.organization_id::text as "organizationId",
           a.family_id::text as "familyId",
           a.family_payer_id::text as "familyPayerId",
           a.payment_provider_account_id::text as "paymentProviderAccountId",
           a.status::text as "status",
           a.consent_version as "consentVersion",
           a.consent_evidence_reference as "consentEvidenceReference",
           a.consent_evidence_sha256 as "consentEvidenceSha256",
           a.consented_at as "consentedAt",
           a.consented_by_guardian_id::text as "consentedByGuardianId",
           a.valid_until as "validUntil",
           a.revoked_at as "revokedAt",
           a.payment_method_kind as "paymentMethodKind",
           a.payment_method_reference as "paymentMethodReference",
           a.mandate_reference as "mandateReference",
           (
             select case
                      when count(*) = 1
                       and bool_and(s.family_payer_id = a.family_payer_id
                                    and s.payment_provider_account_id = a.payment_provider_account_id)
                      then min(s.provider_customer_reference)
                    end
               from zaltyko.family_payment_setup_attempts s
              where s.organization_id = a.organization_id
                and s.authorization_id = a.id
           ) as "customerReference"
      from zaltyko.family_payment_authorizations a
     where a.organization_id = ${input.organizationId}::uuid
       and a.payment_provider_account_id = ${input.accountId}::uuid
       and a.family_payer_id = ${input.familyPayerId}::uuid
       and a.status = 'active'::zaltyko.payment_authorization_status
     order by a.id
     limit 1
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    authorization: {
      id: String(row.id),
      organizationId: String(row.organizationId),
      familyId: String(row.familyId),
      familyPayerId: String(row.familyPayerId),
      paymentProviderAccountId: String(row.paymentProviderAccountId),
      status: String(row.status) as CollectionAuthorizationRow["status"],
      consentVersion: toStringOrNull(row.consentVersion),
      consentEvidenceReference: toStringOrNull(row.consentEvidenceReference),
      consentEvidenceSha256: toStringOrNull(row.consentEvidenceSha256),
      consentedAt: toDateOrNull(row.consentedAt),
      consentedByGuardianId: toStringOrNull(row.consentedByGuardianId),
      validUntil: toDateOrNull(row.validUntil),
      revokedAt: toDateOrNull(row.revokedAt),
      paymentMethodKind: toStringOrNull(row.paymentMethodKind),
      paymentMethodReference: String(row.paymentMethodReference ?? ""),
      mandateReference: toStringOrNull(row.mandateReference),
    },
    customerReference: toStringOrNull(row.customerReference),
  };
}

/**
 * Fila de family_payers de la factura con el estado del tutor. El vínculo
 * cuenta como activo solo si `family_guardians` y la familia están activos.
 */
async function readPayer(
  executor: Executor,
  organizationId: string,
  familyPayerId: string
): Promise<FamilyCollectionGatePayer | null> {
  const result = await executor.execute(sql`
    select fp.id::text as "id",
           fp.organization_id::text as "organizationId",
           fp.family_id::text as "familyId",
           fp.starts_on::text as "startsOn",
           fp.ends_on::text as "endsOn",
           g.is_active as "guardianActive",
           coalesce(fg.is_active and f.is_active, false) as "guardianLinkActive"
      from zaltyko.family_payers fp
      join zaltyko.guardians g
        on g.organization_id = fp.organization_id and g.id = fp.guardian_id
      join zaltyko.families f
        on f.organization_id = fp.organization_id and f.id = fp.family_id
      left join zaltyko.family_guardians fg
        on fg.organization_id = fp.organization_id
       and fg.family_id = fp.family_id
       and fg.guardian_id = fp.guardian_id
     where fp.organization_id = ${organizationId}::uuid
       and fp.id = ${familyPayerId}::uuid
     limit 1
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    familyId: String(row.familyId),
    startsOn: String(row.startsOn),
    endsOn: toStringOrNull(row.endsOn),
    guardianActive: row.guardianActive === true,
    guardianLinkActive: row.guardianLinkActive === true,
  };
}

async function readPreference(
  executor: Executor,
  organizationId: string,
  familyId: string
): Promise<InvoiceCollectionContext["preference"]> {
  const result = await executor.execute(sql`
    select requested_mode::text as "requestedMode",
           entitlement_revision as "entitlementRevision"
      from zaltyko.family_collection_preferences
     where organization_id = ${organizationId}::uuid
       and family_id = ${familyId}::uuid
     limit 1
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    requestedMode: row.requestedMode === "automatic" ? "automatic" : "manual",
    entitlementRevision:
      row.entitlementRevision === null || row.entitlementRevision === undefined
        ? null
        : Number(row.entitlementRevision),
  };
}

async function readAllocations(executor: Executor, attempt: CollectionAttempt): Promise<CollectionAllocationRow[]> {
  const result = await executor.execute(sql`
    select charge_id::text as "chargeId", amount_cents::text as "amountCents"
      from zaltyko.family_collection_attempt_charges
     where organization_id = ${attempt.organizationId}::uuid
       and attempt_id = ${attempt.id}::uuid
     order by charge_id
  `);
  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    chargeId: String(row.chargeId),
    amountCents: toCents(row.amountCents),
  }));
}

// ---------------------------------------------------------------------------
// Bloqueos (orden único: academia → cuotas por id → factura → intento)
// ---------------------------------------------------------------------------

async function lockInvoiceCharges(tx: TransactionClient, organizationId: string, invoiceId: string): Promise<void> {
  await tx.execute(sql`
    select id from zaltyko.charges
     where organization_id = ${organizationId}::uuid
       and invoice_id = ${invoiceId}::uuid
     order by id
     for update
  `);
}

async function lockAttemptCharges(tx: TransactionClient, organizationId: string, attemptId: string): Promise<void> {
  await tx.execute(sql`
    select c.id
      from zaltyko.charges c
     where c.organization_id = ${organizationId}::uuid
       and c.id in (
         select ac.charge_id from zaltyko.family_collection_attempt_charges ac
          where ac.organization_id = ${organizationId}::uuid
            and ac.attempt_id = ${attemptId}::uuid
       )
     order by c.id
     for update of c
  `);
}

async function lockInvoice(tx: TransactionClient, organizationId: string, invoiceId: string): Promise<void> {
  await tx.execute(sql`
    select id from zaltyko.invoices
     where organization_id = ${organizationId}::uuid and id = ${invoiceId}::uuid
     for update
  `);
}

/**
 * Bloquea en el orden único el intento y lo que toca, y lo devuelve solo si
 * sigue abierto (claimed, created o processing).
 */
async function lockOpenAttempt(
  tx: TransactionClient,
  organizationId: string,
  attemptId: string
): Promise<CollectionAttempt | null> {
  const found = await tx.execute(sql`
    select invoice_id::text as "invoiceId"
      from zaltyko.family_collection_attempts
     where organization_id = ${organizationId}::uuid and id = ${attemptId}::uuid
  `);
  const invoiceId = (found.rows[0] as { invoiceId?: unknown } | undefined)?.invoiceId;
  if (typeof invoiceId !== "string") return null;

  await lockOrganizationForSaasMutation(tx, organizationId);
  await lockAttemptCharges(tx, organizationId, attemptId);
  await lockInvoice(tx, organizationId, invoiceId);
  const locked = await tx.execute(sql`
    select ${attemptColumns}
      from zaltyko.family_collection_attempts
     where organization_id = ${organizationId}::uuid
       and id = ${attemptId}::uuid
       and status in (${openStatusList})
     for update
  `);
  const row = locked.rows[0] as Record<string, unknown> | undefined;
  return row ? toAttempt(row) : null;
}

// ---------------------------------------------------------------------------
// Auditoría y outbox (solo ids y códigos)
// ---------------------------------------------------------------------------

async function recordTransition(
  tx: TransactionClient,
  attempt: CollectionAttempt,
  input: {
    event: string;
    payload: Record<string, unknown>;
    now: Date;
    /** Además del outbox, una línea de auditoría. */
    audit?: boolean;
  }
): Promise<void> {
  const reviewReason = input.event === "needs_review" ? input.payload.reason : undefined;
  const idempotencyKey =
    typeof reviewReason === "string"
      ? needsReviewKey({ attemptId: attempt.id, invoiceId: attempt.invoiceId, reason: reviewReason })
      : `family-collection:${attempt.id}:${input.event}`;
  const eventName = `family_collection.${input.event}`;
  const payload = { attemptId: attempt.id, invoiceId: attempt.invoiceId, ...input.payload };
  if (!(await findOutboxEvent(tx, { organizationId: attempt.organizationId, eventName, idempotencyKey }))) {
    await appendOutboxEvent(tx, {
      organizationId: attempt.organizationId,
      locationId: attempt.locationId,
      eventName,
      aggregateType: "family_collection_attempt",
      aggregateId: attempt.id,
      idempotencyKey,
      payload,
      occurredAt: input.now,
    });
  }
  if (input.audit) {
    await appendAuditEntry(tx, {
      organizationId: attempt.organizationId,
      locationId: attempt.locationId,
      actorUserId: null,
      action: eventName,
      targetType: "family_collection_attempt",
      targetId: attempt.id,
      idempotencyKey,
      after: payload,
      metadata: SYSTEM_AUDIT_METADATA,
    });
  }
}

// ---------------------------------------------------------------------------
// Implementación
// ---------------------------------------------------------------------------

export function createFamilyCollectionStore(): FamilyCollectionStore {
  return {
    async isStorageAvailable() {
      const [collection, paymentMethods, connect] = await Promise.all([
        isFamilyCollectionStorageAvailable(db),
        isFamilyPaymentMethodsStorageAvailable(db),
        isConnectOnboardingStorageAvailable(db),
      ]);
      return collection && paymentMethods && connect;
    },

    async listDueInvoices(input) {
      const result = await db.execute(sql`
        select i.id::text as "invoiceId", i.organization_id::text as "organizationId"
          from zaltyko.invoices i
          left join lateral (
            select a.status, a.next_retry_at
              from zaltyko.family_collection_attempts a
             where a.organization_id = i.organization_id
               and a.invoice_id = i.id
             order by a.attempt_number desc
             limit 1
          ) as last on true
         where i.status in ('issued', 'partially_paid')
           and ${inScope(sql.raw("i.organization_id"), input.scope)}
           and (${input.after}::uuid is null or i.id > ${input.after}::uuid)
           and exists (
             select 1 from zaltyko.charges c
              where c.organization_id = i.organization_id
                and c.invoice_id = i.id
                and c.collection_mode = 'automatic'
                and c.status in ('due', 'partially_paid')
                and c.due_at <= ${input.horizon.toISOString()}::timestamptz
           )
           and not exists (
             select 1 from zaltyko.family_collection_attempts a
              where a.organization_id = i.organization_id
                and a.invoice_id = i.id
                and a.status in (${openStatusList})
           )
           and (
             last.status is null
             or (
               last.status = 'failed'
               and last.next_retry_at is not null
               and last.next_retry_at <= ${input.horizon.toISOString()}::timestamptz
             )
           )
         order by i.id
         limit ${input.limit}
      `);
      return (result.rows as Array<Record<string, unknown>>).map((row) => ({
        invoiceId: String(row.invoiceId),
        organizationId: String(row.organizationId),
      }));
    },

    async loadInvoiceContext(input) {
      const found = await readInvoice(db, input.organizationId, input.invoiceId);
      if (!found) return null;
      const { invoice } = found;
      const [charges, plan, planChangeRevision, preference, settings, account, history] = await Promise.all([
        readCharges(db, invoice.organizationId, invoice.id),
        loadOrganizationPlanState(db, invoice.organizationId),
        loadPlanChangeRevision(db, invoice.organizationId),
        readPreference(db, invoice.organizationId, invoice.familyId),
        findCollectionSettings(db, invoice.organizationId),
        readAccount(db, invoice.organizationId, input.environment),
        readHistory(db, invoice.organizationId, invoice.id),
      ]);
      const active =
        account && invoice.familyPayerId
          ? await readActiveAuthorization(db, {
              organizationId: invoice.organizationId,
              accountId: account.id,
              familyPayerId: invoice.familyPayerId,
            })
          : null;
      const payer = invoice.familyPayerId ? await readPayer(db, invoice.organizationId, invoice.familyPayerId) : null;
      return {
        invoice,
        charges,
        organization: { id: invoice.organizationId, status: found.organizationStatus },
        plan,
        planChangeRevision,
        preference,
        collectionDayOfMonth: settings?.collectionDayOfMonth ?? null,
        account,
        authorization: active?.authorization ?? null,
        customerReference: active?.customerReference ?? null,
        payer,
        history,
      };
    },

    async claimOrCancel(input, decide) {
      return db.transaction(async (tx) => {
        await lockOrganizationForSaasMutation(tx, input.organizationId);
        await lockInvoiceCharges(tx, input.organizationId, input.invoiceId);
        await lockInvoice(tx, input.organizationId, input.invoiceId);

        const found = await readInvoice(tx, input.organizationId, input.invoiceId);
        if (!found) return { outcome: "skipped", reason: "invoice_missing" } as const;
        const charges = await readCharges(tx, input.organizationId, input.invoiceId);
        const history = await readHistory(tx, input.organizationId, input.invoiceId);
        let authorization: LockedInvoiceSnapshot["authorization"] = null;
        if (input.authorizationId) {
          // Releída en la transacción y bloqueada para compartir: una baja
          // concurrente del método espera a que el intento quede escrito.
          const result = await tx.execute(sql`
            select id::text as "id",
                   organization_id::text as "organizationId",
                   family_id::text as "familyId",
                   family_payer_id::text as "familyPayerId",
                   payment_provider_account_id::text as "paymentProviderAccountId",
                   status::text as "status"
              from zaltyko.family_payment_authorizations
             where organization_id = ${input.organizationId}::uuid
               and id = ${input.authorizationId}::uuid
             for share
          `);
          const row = result.rows[0] as Record<string, unknown> | undefined;
          authorization = row
            ? {
                id: String(row.id),
                organizationId: String(row.organizationId),
                familyId: String(row.familyId),
                familyPayerId: String(row.familyPayerId),
                paymentProviderAccountId: String(row.paymentProviderAccountId),
                status: String(row.status),
              }
            : null;
        }

        const decision = decide({ invoice: found.invoice, charges, history, authorization });
        if (decision.action === "skip") return { outcome: "skipped", reason: decision.reason } as const;

        const invoice = found.invoice;
        const canceled = decision.action === "canceled";
        const inserted = await tx.execute(sql`
          insert into zaltyko.family_collection_attempts (
            organization_id, location_id, invoice_id, family_id, family_payer_id, authorization_id,
            payment_provider_account_id, attempt_number, payment_method_kind, amount_cents, currency,
            status, failure_code, claimed_at, completed_at, created_at, updated_at
          ) values (
            ${invoice.organizationId}::uuid,
            ${invoice.locationId}::uuid,
            ${invoice.id}::uuid,
            ${invoice.familyId}::uuid,
            ${invoice.familyPayerId}::uuid,
            ${input.authorizationId}::uuid,
            ${input.paymentProviderAccountId}::uuid,
            ${decision.attemptNumber},
            ${input.paymentMethodKind},
            ${decision.amountCents},
            ${invoice.currency},
            ${decision.action},
            ${canceled ? (decision.reason ?? null) : null},
            ${input.now.toISOString()}::timestamptz,
            ${canceled ? input.now.toISOString() : null}::timestamptz,
            ${input.now.toISOString()}::timestamptz,
            ${input.now.toISOString()}::timestamptz
          )
          on conflict do nothing
          returning ${attemptColumns}
        `);
        const row = inserted.rows[0] as Record<string, unknown> | undefined;
        // Otro proceso ya tiene un intento abierto (índice parcial) o ese número.
        if (!row) return { outcome: "skipped", reason: "concurrent" } as const;
        const attempt = toAttempt(row);

        for (const allocation of decision.allocations) {
          await tx.execute(sql`
            insert into zaltyko.family_collection_attempt_charges (attempt_id, organization_id, charge_id, amount_cents)
            values (${attempt.id}::uuid, ${attempt.organizationId}::uuid, ${allocation.chargeId}::uuid, ${allocation.amountCents})
          `);
        }

        if (canceled) {
          await recordTransition(tx, attempt, {
            event: "attempt_canceled",
            payload: { attemptNumber: attempt.attemptNumber, reason: decision.reason ?? null },
            now: input.now,
            audit: true,
          });
          return { outcome: "canceled", attempt } as const;
        }
        await recordTransition(tx, attempt, {
          event: "attempt_claimed",
          payload: {
            attemptNumber: attempt.attemptNumber,
            amountCents: attempt.amountCents,
            currency: attempt.currency,
            paymentMethodKind: attempt.paymentMethodKind,
            chargeIds: decision.allocations.map((allocation) => allocation.chargeId),
          },
          now: input.now,
          audit: true,
        });
        return { outcome: "claimed", attempt, allocations: decision.allocations } as const;
      });
    },

    async markCreated(input) {
      return db.transaction(async (tx) => {
        const attempt = await lockOpenAttempt(tx, input.organizationId, input.attemptId);
        if (!attempt || attempt.status !== "claimed") return false;
        await tx.execute(sql`
          update zaltyko.family_collection_attempts
             set status = 'created',
                 provider_payment_intent_reference = ${input.paymentIntentId},
                 updated_at = ${input.now.toISOString()}::timestamptz
           where organization_id = ${input.organizationId}::uuid
             and id = ${input.attemptId}::uuid
             and status = 'claimed'
        `);
        return true;
      });
    },

    async applyOutcome(input) {
      return db.transaction(async (tx): Promise<ApplyOutcomeResult> => {
        const attempt = await lockOpenAttempt(tx, input.organizationId, input.attemptId);
        if (!attempt) return { applied: false };
        const outcome = input.outcome;
        const intent = outcome.paymentIntentId;
        // Un intento nunca cambia de cobro: si ya tiene uno, tiene que ser este.
        if (intent !== null && attempt.paymentIntentId !== null && attempt.paymentIntentId !== intent) {
          throw new Error("FAMILY_COLLECTION_INTENT_MISMATCH");
        }
        const now = input.now.toISOString();

        if (outcome.kind === "succeeded") {
          // Paso 0: Stripe tiene que haber cobrado justo el importe del intento
          // y en euros. Si no, el pago no entra en el libro: el intento se
          // queda como está (su dinero se movió) y la academia lo revisa.
          if (!receivedMatches(outcome.received, { amountCents: attempt.amountCents, currency: attempt.currency })) {
            const mismatch = {
              expectedAmountCents: attempt.amountCents,
              receivedAmountCents: outcome.received.amountCents,
              receivedCurrency: outcome.received.currency,
            };
            // Solo ids, importes y moneda: nunca datos de la familia ni de Stripe.
            logger.error("Cobro automático: Stripe cobró un importe distinto al del intento", undefined, {
              organizationId: attempt.organizationId,
              invoiceId: attempt.invoiceId,
              attemptId: attempt.id,
              ...mismatch,
            });
            await recordTransition(tx, attempt, {
              event: "needs_review",
              payload: { reason: AMOUNT_MISMATCH_REASON, paymentIntentId: outcome.paymentIntentId, ...mismatch },
              now: input.now,
            });
            return { applied: false, review: AMOUNT_MISMATCH_REASON };
          }

          // Paso 1: el pago queda registrado (no puede fallar por saldos).
          const { payment } = await recordProviderCollectionPayment(tx, {
            organizationId: attempt.organizationId,
            attemptId: attempt.id,
            invoiceId: attempt.invoiceId,
            paymentIntentId: outcome.paymentIntentId,
            amountCents: attempt.amountCents,
            environment: input.environment,
            receivedAt: input.now,
          });
          // El mismo cobro de Stripe ya estaba registrado para otro intento:
          // ese pago no es de este intento. Nunca se da por cobrado ni por
          // fallido; se queda como está y la academia lo revisa.
          if (payment.idempotencyKey !== `family-collection:${attempt.id}:${outcome.paymentIntentId}`) {
            await recordTransition(tx, attempt, {
              event: "needs_review",
              payload: { reason: "payment_recorded_for_other_attempt", paymentId: payment.id },
              now: input.now,
            });
            return { applied: false, review: "payment_recorded_for_other_attempt" };
          }

          // Paso 2: el reparto entre cuotas, en un punto de guardado. Si algo
          // inesperado lo rompe, se deshace solo el reparto: el pago sigue
          // registrado y la academia recibe el aviso para revisarlo.
          const allocations = await readAllocations(tx, attempt);
          let allocation: { status: ProviderCollectionAllocationResult["status"]; reviewReasons: string[] };
          if (allocations.length === 0) {
            allocation = { status: "needs_review", reviewReasons: ["charge_mismatch"] };
          } else {
            try {
              allocation = await tx.transaction((savepoint) =>
                allocateProviderCollectionPayment(savepoint, {
                  organizationId: attempt.organizationId,
                  attemptId: attempt.id,
                  invoiceId: attempt.invoiceId,
                  paymentId: payment.id,
                  allocations,
                  allocatedAt: input.now,
                })
              );
            } catch (error) {
              // Solo ids y el nombre o código del error: nunca SQL ni mensajes.
              logger.error("Cobro automático: falló el reparto de un cobro registrado", undefined, {
                organizationId: attempt.organizationId,
                invoiceId: attempt.invoiceId,
                attemptId: attempt.id,
                paymentId: payment.id,
                errorName: error instanceof Error ? error.name : "unknown",
                errorCode: errorCodeOf(error),
              });
              allocation = { status: "needs_review", reviewReasons: ["allocation_error"] };
            }
          }
          // Paso 3: el intento, ya con su pago y el estado del reparto.
          await tx.execute(sql`
            update zaltyko.family_collection_attempts
               set status = 'succeeded',
                   provider_payment_intent_reference = ${outcome.paymentIntentId},
                   payment_id = ${payment.id}::uuid,
                   allocation_status = ${allocation.status},
                   failure_code = null,
                   decline_code = null,
                   next_retry_at = null,
                   completed_at = ${now}::timestamptz,
                   updated_at = ${now}::timestamptz
             where organization_id = ${attempt.organizationId}::uuid
               and id = ${attempt.id}::uuid
          `);
          await recordTransition(tx, attempt, {
            event: "attempt_succeeded",
            payload: { paymentId: payment.id, amountCents: attempt.amountCents, allocationStatus: allocation.status },
            now: input.now,
            audit: true,
          });
          if (allocation.status === "needs_review") {
            await recordTransition(tx, attempt, {
              event: "needs_review",
              payload: { reason: "allocation", reviewReasons: allocation.reviewReasons, paymentId: payment.id },
              now: input.now,
            });
          }
          return {
            applied: true,
            status: "succeeded",
            allocationStatus: allocation.status,
            reviewReasons: allocation.reviewReasons,
          };
        }

        if (outcome.kind === "processing") {
          await tx.execute(sql`
            update zaltyko.family_collection_attempts
               set status = 'processing',
                   provider_payment_intent_reference = ${outcome.paymentIntentId},
                   updated_at = ${now}::timestamptz
             where organization_id = ${attempt.organizationId}::uuid
               and id = ${attempt.id}::uuid
          `);
          await recordTransition(tx, attempt, { event: "attempt_processing", payload: {}, now: input.now, audit: true });
          return { applied: true, status: "processing", allocationStatus: null, reviewReasons: [] };
        }

        if (outcome.kind === "failed") {
          await tx.execute(sql`
            update zaltyko.family_collection_attempts
               set status = 'failed',
                   provider_payment_intent_reference = coalesce(provider_payment_intent_reference, ${intent}),
                   failure_code = ${storedCode(outcome.code)},
                   decline_code = ${outcome.declineCode === null ? null : storedCode(outcome.declineCode)},
                   next_retry_at = ${outcome.nextRetryAt ? outcome.nextRetryAt.toISOString() : null}::timestamptz,
                   completed_at = ${now}::timestamptz,
                   updated_at = ${now}::timestamptz
             where organization_id = ${attempt.organizationId}::uuid
               and id = ${attempt.id}::uuid
          `);
          await recordTransition(tx, attempt, {
            event: "attempt_failed",
            payload: {
              code: outcome.code,
              declineCode: outcome.declineCode,
              retryScheduled: outcome.nextRetryAt !== null,
            },
            now: input.now,
            audit: true,
          });
          if (outcome.nextRetryAt === null) {
            // Sin reintento: la cuota vuelve a manual y a los recordatorios.
            await recordTransition(tx, attempt, {
              event: "final_failure",
              payload: { code: outcome.code, declineCode: outcome.declineCode },
              now: input.now,
            });
          }
          return { applied: true, status: "failed", allocationStatus: null, reviewReasons: [] };
        }

        await tx.execute(sql`
          update zaltyko.family_collection_attempts
             set status = 'canceled',
                 provider_payment_intent_reference = coalesce(provider_payment_intent_reference, ${intent}),
                 failure_code = ${outcome.reason},
                 decline_code = null,
                 next_retry_at = null,
                 completed_at = ${now}::timestamptz,
                 updated_at = ${now}::timestamptz
           where organization_id = ${attempt.organizationId}::uuid
             and id = ${attempt.id}::uuid
        `);
        await recordTransition(tx, attempt, {
          event: "attempt_canceled",
          payload: { attemptNumber: attempt.attemptNumber, reason: outcome.reason },
          now: input.now,
          audit: true,
        });
        return { applied: true, status: "canceled", allocationStatus: null, reviewReasons: [] };
      });
    },

    async claimResumable(input) {
      // Una sola sentencia: toma y cuenta la reanudación a la vez; dos
      // procesos nunca toman el mismo intento (skip locked).
      //
      // La antigüedad se mide desde el último cambio (`updated_at`: la última
      // toma, el `pi_…` guardado…), no desde que se reclamó: varias
      // ejecuciones seguidas el mismo día no gastan las reanudaciones de un
      // intento que otra acaba de tocar.
      //
      // Sin el cerrojo de la academia: esta sentencia solo cambia
      // `resume_count` y `updated_at` del propio intento (ni cuotas ni
      // factura), y con skip locked nunca espera a una fila que otra
      // transacción tenga bloqueada (p. ej. applyOutcome, que bloquea el
      // intento el último del orden único): no puede formar un ciclo de
      // espera. Quien avanza el intento después sí sigue el orden único.
      //
      // Devuelve también el `updated_at` de antes de la toma (como texto, para
      // no perder microsegundos): releaseResume lo repone si la ejecución no
      // llega a procesar el intento.
      const result = await db.execute(sql`
        with taken as (
          select id as taken_id, updated_at as previous_updated_at
            from zaltyko.family_collection_attempts
           where status in ('claimed', 'created')
             and updated_at < ${input.staleBefore.toISOString()}::timestamptz
             and resume_count < ${FAMILY_COLLECTION_MAX_RESUMES}
             and ${inScope(sql.raw("organization_id"), input.scope)}
             and (${input.after}::uuid is null or id > ${input.after}::uuid)
           order by id
           limit ${input.limit}
           for update skip locked
        )
        update zaltyko.family_collection_attempts
           set resume_count = resume_count + 1,
               updated_at = ${input.now.toISOString()}::timestamptz
          from taken
         where id = taken.taken_id
           and status in ('claimed', 'created')
           and resume_count < ${FAMILY_COLLECTION_MAX_RESUMES}
        returning ${attemptColumns}, taken.previous_updated_at::text as "previousUpdatedAt"
      `);
      return (result.rows as Array<Record<string, unknown>>)
        .map(
          (row): ResumedAttempt => ({
            ...toAttempt(row),
            resumeClaim: { takenAt: input.now, previousUpdatedAt: String(row.previousUpdatedAt) },
          })
        )
        .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    },

    async releaseResume(attempt) {
      return db.transaction(async (tx) => {
        // Orden único (academia → cuotas → factura → intento), como quien avanza el intento.
        const locked = await lockOpenAttempt(tx, attempt.organizationId, attempt.id);
        if (!locked || (locked.status !== "claimed" && locked.status !== "created")) return false;
        const result = await tx.execute(sql`
          update zaltyko.family_collection_attempts
             set resume_count = resume_count - 1,
                 updated_at = ${attempt.resumeClaim.previousUpdatedAt}::timestamptz
           where organization_id = ${attempt.organizationId}::uuid
             and id = ${attempt.id}::uuid
             and status in ('claimed', 'created')
             and resume_count = ${attempt.resumeCount}
             and resume_count > 0
             and updated_at = ${attempt.resumeClaim.takenAt.toISOString()}::timestamptz
          returning id::text as "id"
        `);
        return result.rows.length > 0;
      });
    },

    async listProcessing(input) {
      const result = await db.execute(sql`
        select ${attemptColumns}
          from zaltyko.family_collection_attempts
         where status = 'processing'
           and ${inScope(sql.raw("organization_id"), input.scope)}
           and (${input.after}::uuid is null or id > ${input.after}::uuid)
         order by id
         limit ${input.limit}
      `);
      return (result.rows as Array<Record<string, unknown>>).map(toAttempt);
    },

    async listExhaustedWithoutNotice(input) {
      const result = await db.execute(sql`
        select ${attemptColumns}
          from zaltyko.family_collection_attempts a
         where a.status in ('claimed', 'created')
           and a.resume_count >= ${FAMILY_COLLECTION_MAX_RESUMES}
           and ${inScope(sql.raw("a.organization_id"), input.scope)}
           and (${input.after}::uuid is null or a.id > ${input.after}::uuid)
           and not exists (
             select 1 from zaltyko.outbox_events e
              where e.organization_id = a.organization_id
                and e.event_name = ${NEEDS_REVIEW_EVENT}
                and e.idempotency_key = 'family-collection:' || a.id::text || ':needs_review:resume_exhausted'
           )
         order by a.id
         limit ${input.limit}
      `);
      return (result.rows as Array<Record<string, unknown>>).map(toAttempt);
    },

    async loadAttemptRefs(attempt) {
      if (!attempt.paymentProviderAccountId) return null;
      const result = await db.execute(sql`
        select acc.provider_account_reference as "connectedAccount",
               au.payment_method_reference as "paymentMethod",
               au.mandate_reference as "mandate",
               l.timezone as "timezone",
               (
                 select to_char(min(c.service_period_start), 'YYYY-MM-DD')
                   from zaltyko.family_collection_attempt_charges ac
                   join zaltyko.charges c on c.organization_id = ac.organization_id and c.id = ac.charge_id
                  where ac.organization_id = a.organization_id and ac.attempt_id = a.id
               ) as "servicePeriodStart",
               (
                 select f.claimed_at
                   from zaltyko.family_collection_attempts f
                  where f.organization_id = a.organization_id
                    and f.invoice_id = a.invoice_id
                    and f.attempt_number = 1
               ) as "firstAttemptClaimedAt",
               (
                 select case
                          when count(*) = 1
                           and bool_and(s.family_payer_id = au.family_payer_id
                                        and s.payment_provider_account_id = au.payment_provider_account_id)
                          then min(s.provider_customer_reference)
                        end
                   from zaltyko.family_payment_setup_attempts s
                  where s.organization_id = a.organization_id
                    and s.authorization_id = a.authorization_id
               ) as "customer",
               (
                 au.id is null
                 or (au.family_id = a.family_id
                     and au.family_payer_id = a.family_payer_id
                     and au.payment_provider_account_id = a.payment_provider_account_id)
               ) as "authorizationMatches"
          from zaltyko.family_collection_attempts a
          join zaltyko.organization_payment_provider_accounts acc
            on acc.organization_id = a.organization_id and acc.id = a.payment_provider_account_id
          join zaltyko.locations l
            on l.organization_id = a.organization_id and l.id = a.location_id
          left join zaltyko.family_payment_authorizations au
            on au.organization_id = a.organization_id and au.id = a.authorization_id
         where a.organization_id = ${attempt.organizationId}::uuid
           and a.id = ${attempt.id}::uuid
         limit 1
      `);
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      // La autorización del intento debe ser del pagador, la familia y la cuenta
      // del intento (ninguna clave foránea lo ata): si no, no hay con qué cobrar.
      const matches = row.authorizationMatches === true;
      return {
        connectedAccount: String(row.connectedAccount),
        customer: matches ? toStringOrNull(row.customer) : null,
        paymentMethod: matches ? toStringOrNull(row.paymentMethod) : null,
        mandate: matches ? toStringOrNull(row.mandate) : null,
        timezone: String(row.timezone),
        servicePeriodStart: toStringOrNull(row.servicePeriodStart),
        firstAttemptClaimedAt: toDateOrNull(row.firstAttemptClaimedAt),
        allocations: await readAllocations(db, attempt),
      };
    },

    async recordNotice(input) {
      return db.transaction(async (tx) => {
        const eventName = NEEDS_REVIEW_EVENT;
        const idempotencyKey = needsReviewKey(input);
        if (await findOutboxEvent(tx, { organizationId: input.organizationId, eventName, idempotencyKey })) {
          return false;
        }
        await appendOutboxEvent(tx, {
          organizationId: input.organizationId,
          locationId: input.locationId,
          eventName,
          aggregateType: input.attemptId ? "family_collection_attempt" : "invoice",
          aggregateId: input.attemptId ?? input.invoiceId,
          idempotencyKey,
          payload: { attemptId: input.attemptId, invoiceId: input.invoiceId, reason: input.reason },
          occurredAt: input.now,
        });
        return true;
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Acciones de la academia: cancelar el cobro automático y marcarlo como revisado
// (family-collection-academy-actions.ts). Sin llamadas a Stripe.
// ---------------------------------------------------------------------------

/** Último intento de una factura, tal como lo ve la academia. */
export interface AcademyAttemptView extends CollectionAttempt {
  nextRetryAt: Date | null;
  /** Último cambio del intento (`updated_at`): la salida de 24 h sin aviso. */
  updatedAt: Date;
  /** La academia recibió al menos un aviso para revisar este intento. */
  hasReviewNotice: boolean;
}

/** Motivo (`failure_code`) con el que la academia cierra un intento. */
export type AcademyCloseReason = "canceled_by_academy" | "reviewed_by_academy";

/** Último intento (por número) de la factura de esa academia, o null. */
export async function readLatestAttemptForAcademy(input: {
  organizationId: string;
  invoiceId: string;
}): Promise<AcademyAttemptView | null> {
  const result = await db.execute(sql`
    select ${attemptColumns},
           next_retry_at as "nextRetryAt",
           updated_at as "updatedAt",
           exists (
             select 1 from zaltyko.outbox_events e
              where e.organization_id = a.organization_id
                and e.event_name = ${NEEDS_REVIEW_EVENT}
                and e.idempotency_key like 'family-collection:' || a.id::text || ':needs_review:%'
           ) as "hasReviewNotice"
      from zaltyko.family_collection_attempts a
     where a.organization_id = ${input.organizationId}::uuid
       and a.invoice_id = ${input.invoiceId}::uuid
     order by a.attempt_number desc
     limit 1
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    ...toAttempt(row),
    nextRetryAt: toDateOrNull(row.nextRetryAt),
    updatedAt: toDate(row.updatedAt),
    hasReviewNotice: row.hasReviewNotice === true,
  };
}

/**
 * Cierra un intento como `canceled` por decisión de la academia, en el orden
 * de bloqueo único (academia → cuotas de la factura por id → factura →
 * intento), solo si sigue tal como la academia lo vio (estado, `pi_…` y, si
 * se pide, reintento pendiente) y sigue siendo el último intento de la
 * factura sin ningún otro abierto: con la factura bloqueada, el proceso diario
 * no puede estar reclamando el reintento a la vez. Deja la auditoría con la
 * persona y el aviso del outbox. `null` si el intento cambió mientras tanto.
 */
export async function closeAttemptByAcademy(input: {
  organizationId: string;
  attemptId: string;
  expected: {
    status: FamilyCollectionAttemptStatus;
    paymentIntentId: string | null;
    retryPending?: boolean;
  };
  reason: AcademyCloseReason;
  actor: { userId: string; memberId: string };
  now: Date;
}): Promise<CollectionAttempt | null> {
  return db.transaction(async (tx) => {
    const found = await tx.execute(sql`
      select invoice_id::text as "invoiceId"
        from zaltyko.family_collection_attempts
       where organization_id = ${input.organizationId}::uuid and id = ${input.attemptId}::uuid
    `);
    const invoiceId = (found.rows[0] as { invoiceId?: unknown } | undefined)?.invoiceId;
    if (typeof invoiceId !== "string") return null;

    await lockOrganizationForSaasMutation(tx, input.organizationId);
    await lockInvoiceCharges(tx, input.organizationId, invoiceId);
    await lockInvoice(tx, input.organizationId, invoiceId);
    // Con la factura bloqueada nadie puede reclamar otro intento: este tiene
    // que seguir siendo el último y no puede haber otro abierto (p. ej. el
    // reintento que el proceso diario acaba de reclamar).
    const history = await tx.execute(sql`
      select max(attempt_number) as "lastNumber",
             count(*) filter (where status in (${openStatusList}) and id <> ${input.attemptId}::uuid)::int as "otherOpen"
        from zaltyko.family_collection_attempts
       where organization_id = ${input.organizationId}::uuid
         and invoice_id = ${invoiceId}::uuid
    `);
    const latest = history.rows[0] as { lastNumber?: unknown; otherOpen?: unknown } | undefined;
    const locked = await tx.execute(sql`
      select ${attemptColumns},
             next_retry_at as "nextRetryAt",
             failure_code as "failureCode",
             decline_code as "declineCode"
        from zaltyko.family_collection_attempts
       where organization_id = ${input.organizationId}::uuid
         and id = ${input.attemptId}::uuid
       for update
    `);
    const row = locked.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    const attempt = toAttempt(row);
    const nextRetryAt = toDateOrNull(row.nextRetryAt);
    if (
      Number(latest?.lastNumber) !== attempt.attemptNumber ||
      Number(latest?.otherOpen ?? 0) !== 0 ||
      attempt.status !== input.expected.status ||
      attempt.paymentIntentId !== input.expected.paymentIntentId ||
      (input.expected.retryPending === true && nextRetryAt === null)
    ) {
      return null;
    }

    const now = input.now.toISOString();
    await tx.execute(sql`
      update zaltyko.family_collection_attempts
         set status = 'canceled',
             failure_code = ${input.reason},
             next_retry_at = null,
             completed_at = coalesce(completed_at, ${now}::timestamptz),
             updated_at = ${now}::timestamptz
       where organization_id = ${input.organizationId}::uuid
         and id = ${input.attemptId}::uuid
         and status = ${attempt.status}
    `);

    // Misma clave que los demás cierres del intento: se cancela una sola vez.
    const idempotencyKey = `family-collection:${attempt.id}:attempt_canceled`;
    const payload = { attemptId: attempt.id, invoiceId: attempt.invoiceId, attemptNumber: attempt.attemptNumber, reason: input.reason };
    const eventName = "family_collection.attempt_canceled";
    if (!(await findOutboxEvent(tx, { organizationId: attempt.organizationId, eventName, idempotencyKey }))) {
      await appendOutboxEvent(tx, {
        organizationId: attempt.organizationId,
        locationId: attempt.locationId,
        eventName,
        aggregateType: "family_collection_attempt",
        aggregateId: attempt.id,
        idempotencyKey,
        payload,
        occurredAt: input.now,
      });
    }
    await appendAuditEntry(tx, {
      organizationId: attempt.organizationId,
      locationId: attempt.locationId,
      actorUserId: input.actor.userId,
      action:
        input.reason === "reviewed_by_academy"
          ? "family_collection.attempt_reviewed"
          : "family_collection.attempt_canceled",
      targetType: "family_collection_attempt",
      targetId: attempt.id,
      idempotencyKey,
      before: {
        status: attempt.status,
        failureCode: toStringOrNull(row.failureCode),
        declineCode: toStringOrNull(row.declineCode),
        retryPending: nextRetryAt !== null,
        resumeCount: attempt.resumeCount,
      },
      after: { status: "canceled", ...payload },
      metadata: { memberId: input.actor.memberId },
    });
    return { ...attempt, status: "canceled" };
  });
}

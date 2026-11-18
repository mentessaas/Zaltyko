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
 *   (lockOrganizationForSaasMutation) → cuotas por id → factura → intento
 *   (→ disputa) → pago (C18: el pago, al repartir un cobro o al anotar una
 *   devolución);
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
  FAMILY_COLLECTION_PROCESSOR,
  recordProviderCollectionPayment,
  recordProviderRefund,
  type ProviderCollectionAllocationResult,
} from "@/modules/billing/application/ledger-service";
import {
  loadOrganizationPlanState,
  loadPlanChangeRevision,
  type OrganizationPlanState,
} from "@/modules/billing/application/plan-state";
import type { CollectionPlanChargeStatus, CollectionPlanInvoiceStatus } from "@/modules/family-collection/domain/collection-plan";
import {
  FAMILY_FAILURE_NOTICE,
  notifiesFamilyOnCancel,
  notifiesFamilyOnFailure,
} from "@/modules/family-collection/domain/family-failure-notice";
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
import {
  DUPLICATE_COLLECTION_REASON,
  LATE_SUCCESS_ELSEWHERE_CODE,
  LATE_SUCCESS_PENDING_REASON,
  LATE_SUCCESS_SIBLING_IN_FLIGHT,
} from "@/modules/family-collection/domain/late-success";
import {
  isFamilyCollectionEventsStorageAvailable,
  isFamilyCollectionStorageAvailable,
} from "@/modules/family-collection/application/storage";
import { isFamilyCollectionReceiptsFlagEnabled } from "@/modules/family-collection/application/config";
import { collectionWindowAnchor } from "@/modules/family-collection/domain/authentication-window";
import { FAMILY_RECEIPT } from "@/modules/family-collection/domain/family-receipt";
import {
  providerRefundIdempotencyKey,
  providerRefundReference,
  RefundDoesNotFitError,
  REFUND_UNALLOCATED_REASON,
  REFUNDED_NOTICE_REASON,
  splitRefund,
  type RefundableAllocation,
} from "@/modules/family-collection/domain/refund-split";
import { findCollectionSettings } from "@/modules/family-collection/infrastructure/collection-settings-store";
import {
  invoiceHasLatePending,
  latePendingAttempt,
  NEEDS_REVIEW_EVENT,
} from "@/modules/family-collection/infrastructure/late-success-sql";
import {
  FAMILY_COLLECTION_MAX_RESUMES,
  FAMILY_COLLECTION_OPEN_STATUSES,
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

/**
 * Estados en los que un intento todavía puede avanzar: los de
 * FAMILY_COLLECTION_OPEN_STATUSES (Fase 4: también `requires_action`, que
 * solo puede existir con la forma "phase4"; con la Fase 3 es un texto que no
 * casa con ninguna fila, así que las consultas valen para las dos formas).
 */
const OPEN_STATUSES = FAMILY_COLLECTION_OPEN_STATUSES;

const SYSTEM_AUDIT_METADATA = {
  actor_type: "system",
  job_key: FAMILY_COLLECTION_JOB_KEY,
} as const;

/**
 * Evento del outbox con el que la academia recibe un aviso para revisar un
 * cobro. Vive en late-success-sql.ts (sin dependencias de la base, lo usan
 * también los recordatorios) y se sigue exportando desde aquí.
 */
export { NEEDS_REVIEW_EVENT };

/**
 * Fase 4: códigos del cobro tardío (domain/late-success.ts), también
 * exportados desde aquí.
 */
export {
  DUPLICATE_COLLECTION_REASON,
  LATE_SUCCESS_ELSEWHERE_CODE,
  LATE_SUCCESS_PENDING_REASON,
  LATE_SUCCESS_SIBLING_IN_FLIGHT,
};

/**
 * Clave de un aviso de revisión: una por intento (o por factura, si no hay
 * intento) y motivo. La comparten applyOutcome, recordNotice y la red de
 * seguridad de la Fase A.
 *
 * Fase 4 (C13): los avisos de devoluciones y disputas (`refunded`,
 * `refund_unallocated`, `refund_reversed`, `dispute_*`, `sepa_returned`)
 * añaden la referencia de Stripe (`re_…`, `pyr_…`, `dp_…`, `du_…`), así una
 * segunda devolución del mismo cobro también avisa. Sin referencia, la clave
 * de siempre.
 */
export function needsReviewKey(input: {
  attemptId: string | null;
  invoiceId: string;
  reason: string;
  reference?: string | null;
}): string {
  const base = input.attemptId
    ? `family-collection:${input.attemptId}:needs_review:${input.reason}`
    : `family-collection:invoice:${input.invoiceId}:needs_review:${input.reason}`;
  return input.reference ? `${base}:${input.reference}` : base;
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
  /**
   * Fase 4: fecha local (YYYY-MM-DD) desde la que se cuenta la ventana de
   * cobro del intento (collectionWindowAnchor: la del reintento o la fecha de
   * cobro prevista), o null. De ella sale el plazo para confirmar el pago con
   * el banco (authenticationDeadline). Solo columnas de la Fase 3.
   */
  windowAnchorLocalDate: string | null;
  /**
   * Ola final (M-A3): la autorización del intento sigue `active`. Solo lo
   * mira la confirmación de la familia (startFamilyAuthentication): una
   * revocación no cancela un `requires_action`, pero ya no deja confirmarlo.
   * Opcional para los dobles de los tests; el almacén siempre lo rellena.
   */
  authorizationActive?: boolean;
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
  /** Hay un intento abierto (`claimed`, `created`, `processing` o `requires_action`). */
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
  /** Ya se envió (o se está enviando) un recordatorio de pago de alguna cuota abierta (readReminderSent). */
  reminderSent: boolean;
}

/** Foto bloqueada de la factura dentro de la transacción de reclamar o cancelar. */
export interface LockedInvoiceSnapshot {
  invoice: CollectionInvoiceRow;
  charges: CollectionChargeRow[];
  history: AttemptHistory;
  /** Igual que en el contexto, releído dentro de la transacción ya con los bloqueos. */
  reminderSent: boolean;
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
  | { kind: "canceled"; paymentIntentId: string | null; reason: string }
  /**
   * Fase 4: el banco pide que la familia confirme el pago (solo tarjeta). El
   * intento queda `requires_action` con su plazo (`action_deadline_at`) y,
   * en la misma transacción, el aviso a la familia en el outbox (en cualquier
   * número de intento, una vez por intento). Solo con la forma "phase4".
   */
  | { kind: "requires_action"; paymentIntentId: string; actionDeadlineAt: Date }
  /**
   * Fase 4: el cobro de un intento ya cerrado (`failed` o `canceled`) se
   * completó tarde en Stripe. Solo se aplica desde esos dos estados y con el
   * mismo `pi_…`; nunca si la factura ya tiene otro intento cobrado
   * (DUPLICATE_COLLECTION_REASON) ni mientras tenga otro abierto
   * (LATE_SUCCESS_SIBLING_IN_FLIGHT).
   */
  | { kind: "late_succeeded"; paymentIntentId: string; received: ReceivedAmount };

export type ApplyOutcomeResult =
  /**
   * El intento ya no estaba abierto, o (con `review`) necesita que lo revise
   * una persona: `amount_mismatch`, `payment_recorded_for_other_attempt` o,
   * en un cobro tardío, `duplicate_collection` (DUPLICATE_COLLECTION_REASON).
   */
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
   * Fase 4: ¿tiene el cobro la forma "phase4" (requires_action con su plazo)?
   * Solo entonces se puede escribir o leer `action_deadline_at`.
   */
  isEventsStorageAvailable(): Promise<boolean>;
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
  /** Fase 4: el intento de esa academia que tiene guardado ese `pi_…`, o null. Sin transacción. */
  findAttemptByPaymentIntent(input: { organizationId: string; paymentIntentId: string }): Promise<CollectionAttempt | null>;
  /** Fase 4: el intento de esa academia con ese id, solo si sigue `claimed`; si no, null. Sin transacción. */
  findClaimedAttemptById(input: { organizationId: string; attemptId: string }): Promise<CollectionAttempt | null>;
  /**
   * Fase 4: los demás intentos de la factura (sin `excludeAttemptId`), por
   * número. Lectura sin transacción: applyOutcome repite lo que importa con
   * la factura bloqueada.
   */
  listInvoiceSiblings(input: {
    organizationId: string;
    invoiceId: string;
    excludeAttemptId: string;
  }): Promise<CollectionAttempt[]>;
  /**
   * Aplica el resultado a un intento todavía abierto; si ya no lo está, no
   * hace nada. Un `succeeded` cuyo importe o moneda no cuadran con el intento
   * no registra el pago: deja el aviso `amount_mismatch` y devuelve
   * `{ applied: false, review: "amount_mismatch" }`.
   *
   * Fase 4, `late_succeeded`: solo sobre un intento `failed` o `canceled` con
   * el mismo `pi_…`, con toda la factura bloqueada (academia → cuotas de la
   * factura → factura → sus intentos). Si otro intento ya cobró la factura,
   * no registra nada y deja el aviso `duplicate_collection`; si otro sigue
   * abierto, lanza LATE_SUCCESS_SIBLING_IN_FLIGHT. Si no, anula los
   * reintentos pendientes de la factura y registra y reparte el pago como un
   * `succeeded`.
   *
   * Fase 4, `requires_action`: solo tarjeta y solo con la forma "phase4";
   * guarda el plazo (`action_deadline_at`) y, en la misma transacción, el
   * aviso a la familia (una vez por intento). Sobre un intento que ya está
   * `requires_action` no hace nada (`{ applied: false }`). Un intento
   * `requires_action` está abierto: los demás resultados se le aplican igual.
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
  /**
   * Intentos que relee cada día la Fase A: `processing` y (Fase 4)
   * `requires_action`. Solo compara el estado, sin `action_deadline_at`: vale
   * para las dos formas (con la Fase 3 no hay filas `requires_action`).
   */
  listProcessing(input: { after: string | null; limit: number; scope: OrganizationScope }): Promise<CollectionAttempt[]>;
  /**
   * Fase 4: plazo (`action_deadline_at`) de un intento `requires_action`, o
   * null si ya no lo está. Solo se llama con un intento en ese estado, que
   * solo existe con la forma "phase4" (C2: la Fase 3 nunca lee la columna).
   */
  readActionDeadline(input: { organizationId: string; attemptId: string }): Promise<Date | null>;
  /**
   * Fase 4: intentos `failed`/`canceled` con `pi_…` y el aviso
   * `late_success_pending`, sin ninguno de los avisos que cierran la espera
   * (`duplicate_collection`, `amount_mismatch`,
   * `payment_recorded_for_other_attempt`). Un intento ya cobrado deja de salir
   * por su estado. Por orden de id, después de `after`.
   */
  listLateSuccessPending(input: {
    after: string | null;
    limit: number;
    scope: OrganizationScope;
  }): Promise<CollectionAttempt[]>;
  /**
   * Fase 4 (Tarea M, punto 6): intentos `succeeded` con `pi_…` que tienen un
   * aviso `refund_unallocated` escrito desde `since` cuyo `re_…` todavía no
   * tiene filas en zaltyko.refunds (la devolución no cabía en lo repartido).
   * En cuanto todas sus devoluciones quedan anotadas, el intento deja de
   * salir. Por orden de id, después de `after`. Sin transacción.
   */
  listUnallocatedRefundAttempts(input: {
    after: string | null;
    limit: number;
    scope: OrganizationScope;
    since: Date;
  }): Promise<CollectionAttempt[]>;
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

/**
 * Fecha de la ventana de cobro de un intento a partir de la fila de
 * loadAttemptRefs (collectionWindowAnchor): con intento anterior, su
 * reintento; sin él, la fecha de cobro del vencimiento más antiguo de sus
 * cuotas (es también la fecha de cobro más antigua: collectionDate nunca
 * adelanta un vencimiento posterior por delante de uno anterior). Si falta el
 * intento anterior de un reintento o algo no se puede leer, null.
 */
function windowAnchorOf(row: Record<string, unknown>, attemptNumber: number, timezone: string): string | null {
  try {
    const dayOfMonth = row.collectionDayOfMonth;
    const collectionDayOfMonth =
      dayOfMonth === null || dayOfMonth === undefined ? null : Number(dayOfMonth);
    if (attemptNumber > 1) {
      if (row.previousStatus === null || row.previousStatus === undefined) return null;
      return collectionWindowAnchor({
        previousAttempt: { status: String(row.previousStatus), nextRetryAt: toDateOrNull(row.previousNextRetryAt) },
        charges: [],
        allocations: [],
        timezone,
        collectionDayOfMonth,
      });
    }
    const earliest = toDateOrNull(row.earliestDueAt);
    if (!earliest) return null;
    return collectionWindowAnchor({
      previousAttempt: null,
      charges: [{ id: "earliest", dueAt: earliest }],
      allocations: [{ chargeId: "earliest" }],
      timezone,
      collectionDayOfMonth,
    });
  } catch {
    // Zona horaria, fecha o día de cobro ilegibles: sin ventana (comportamiento de la Fase 3).
    return null;
  }
}

function toKind(value: unknown): CollectionMethodKind | null {
  return value === "card" || value === "sepa_debit" ? value : null;
}

/** Columnas de un intento (toAttempt). También las usa family-collection-dispute-store.ts. */
export const attemptColumns = sql`
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

export function toAttempt(row: Record<string, unknown>): CollectionAttempt {
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

/**
 * ¿Recibió la familia un recordatorio de pago de alguna cuota abierta de la
 * factura? Cuenta un envío aceptado (`sent`) y también una reserva `pending`,
 * de cualquier antigüedad: el correo puede estar saliendo o haber salido sin
 * que se anotara. Solo un envío `failed` (no salió) no cuenta. Tras un
 * recordatorio la familia pudo pagar por fuera, así que nunca se cobra sola
 * (motivo final `reminder_sent` de la puerta).
 *
 * La tabla de recordatorios es de otro candidato
 * (20261114120500_payment_reminders_candidate.sql): si no existe, no se pudo
 * enviar ninguno. Es una lectura sin `for update`: no bloquea filas, así que
 * dentro de la transacción de reclamar no cambia el orden de bloqueo. Quien
 * reserva un recordatorio bloquea antes las cuotas (lockCharges), las mismas
 * que bloquea esa transacción: o la reserva ya está escrita cuando se lee, o
 * el envío espera y después ve el intento en curso y no sale.
 *
 * Cuenta el recordatorio de cualquier cuota abierta de la factura, también
 * de una cuota en cobro manual. Hoy da igual: una factura mensual nace con un
 * solo modo para todas sus cuotas (issue.ts, getChargeCollectionModeSnapshot
 * decide una vez para toda la factura). Si un día una factura mezclara cuotas
 * automáticas y manuales, un recordatorio de la manual también pararía el
 * cobro de la automática (lo seguro: nunca un cobro tras un recordatorio).
 */
async function readReminderSent(executor: Executor, organizationId: string, invoiceId: string): Promise<boolean> {
  const table = await executor.execute(sql`
    select to_regclass('zaltyko.payment_reminders') is not null as "present"
  `);
  if ((table.rows[0] as { present?: unknown } | undefined)?.present !== true) return false;
  const result = await executor.execute(sql`
    select exists (
      select 1
        from zaltyko.payment_reminders r
        join zaltyko.charges c
          on c.organization_id = r.organization_id and c.id = r.charge_id
       where r.organization_id = ${organizationId}::uuid
         and c.invoice_id = ${invoiceId}::uuid
         and c.status in ('due', 'partially_paid')
         and r.status in ('sent', 'pending')
    ) as "reminderSent"
  `);
  return (result.rows[0] as { reminderSent?: unknown } | undefined)?.reminderSent === true;
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

/** El intento de esa academia que tiene guardado ese `pi_…` (el último por número), o null. */
export async function findAttemptByPaymentIntentIn(
  executor: Executor,
  input: { organizationId: string; paymentIntentId: string }
): Promise<CollectionAttempt | null> {
  const result = await executor.execute(sql`
    select ${attemptColumns}
      from zaltyko.family_collection_attempts
     where organization_id = ${input.organizationId}::uuid
       and provider_payment_intent_reference = ${input.paymentIntentId}
     order by attempt_number desc
     limit 1
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? toAttempt(row) : null;
}

/** El intento de esa academia con ese id, solo si sigue `claimed`; si no, null. */
export async function findClaimedAttemptByIdIn(
  executor: Executor,
  input: { organizationId: string; attemptId: string }
): Promise<CollectionAttempt | null> {
  const result = await executor.execute(sql`
    select ${attemptColumns}
      from zaltyko.family_collection_attempts
     where organization_id = ${input.organizationId}::uuid
       and id = ${input.attemptId}::uuid
       and status = 'claimed'
     limit 1
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? toAttempt(row) : null;
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

export async function lockAttemptCharges(tx: TransactionClient, organizationId: string, attemptId: string): Promise<void> {
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

export async function lockInvoice(tx: TransactionClient, organizationId: string, invoiceId: string): Promise<void> {
  await tx.execute(sql`
    select id from zaltyko.invoices
     where organization_id = ${organizationId}::uuid and id = ${invoiceId}::uuid
     for update
  `);
}

/**
 * Bloquea en el orden único el intento y lo que toca, y lo devuelve solo si
 * sigue abierto (claimed, created, processing o, Fase 4, requires_action).
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
// Registro de un cobro hecho (el único camino que escribe en el libro)
// ---------------------------------------------------------------------------

/**
 * Registra y reparte el cobro de un intento ya bloqueado (en el orden único)
 * y lo deja `succeeded`. Lo usan el `succeeded` de siempre y el cobro tardío
 * de la Fase 4 (`late: true`), dentro de la transacción de applyOutcome:
 * primero el pago, después el reparto.
 */
async function recordCollectedPayment(
  tx: TransactionClient,
  attempt: CollectionAttempt,
  input: {
    paymentIntentId: string;
    received: ReceivedAmount;
    environment: "test" | "live";
    now: Date;
    late: boolean;
  }
): Promise<ApplyOutcomeResult> {
  const now = input.now.toISOString();
  // Paso 0: Stripe tiene que haber cobrado justo el importe del intento
  // y en euros. Si no, el pago no entra en el libro: el intento se
  // queda como está (su dinero se movió) y la academia lo revisa.
  if (!receivedMatches(input.received, { amountCents: attempt.amountCents, currency: attempt.currency })) {
    const mismatch = {
      expectedAmountCents: attempt.amountCents,
      receivedAmountCents: input.received.amountCents,
      receivedCurrency: input.received.currency,
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
      payload: { reason: AMOUNT_MISMATCH_REASON, paymentIntentId: input.paymentIntentId, ...mismatch },
      now: input.now,
    });
    return { applied: false, review: AMOUNT_MISMATCH_REASON };
  }

  // Paso 1: el pago queda registrado (no puede fallar por saldos).
  const { payment } = await recordProviderCollectionPayment(tx, {
    organizationId: attempt.organizationId,
    attemptId: attempt.id,
    invoiceId: attempt.invoiceId,
    paymentIntentId: input.paymentIntentId,
    amountCents: attempt.amountCents,
    environment: input.environment,
    receivedAt: input.now,
  });
  // El mismo cobro de Stripe ya estaba registrado para otro intento:
  // ese pago no es de este intento. Nunca se da por cobrado ni por
  // fallido; se queda como está y la academia lo revisa.
  if (payment.idempotencyKey !== `family-collection:${attempt.id}:${input.paymentIntentId}`) {
    await recordTransition(tx, attempt, {
      event: "needs_review",
      payload: { reason: "payment_recorded_for_other_attempt", paymentId: payment.id },
      now: input.now,
    });
    return { applied: false, review: "payment_recorded_for_other_attempt" };
  }

  // Paso 2: el reparto entre cuotas, en un punto de guardado. Si algo
  // inesperado lo rompe, se deshace solo el reparto: el pago sigue
  // registrado y la academia recibe el aviso para revisarlo. Lo que no
  // quepa (cuota ya pagada a mano, anulada…) queda `needs_review`.
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
           provider_payment_intent_reference = ${input.paymentIntentId},
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
    payload: {
      paymentId: payment.id,
      amountCents: attempt.amountCents,
      allocationStatus: allocation.status,
      // Fase 4: cobrado tarde, después de que el intento se cerrara.
      ...(input.late ? { late: true, previousStatus: attempt.status } : {}),
    },
    now: input.now,
    audit: true,
  });
  // Fase 4 (Tarea 9, D6): el justificante de pago para la familia, en la
  // misma transacción que el cobro y una sola vez por intento (clave
  // familyReceiptKey). Solo con ZALTYKO_FAMILY_COLLECTION_RECEIPTS_ENABLED:
  // apagada no se escribe nada, y encenderla después no crea justificantes
  // de cobros anteriores. Solo ids: el correo lo envía deliverFamilyReceipts.
  if (isFamilyCollectionReceiptsFlagEnabled()) {
    await recordTransition(tx, attempt, { event: FAMILY_RECEIPT, payload: { paymentId: payment.id }, now: input.now });
  }
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

/** Estados en los que un intento hermano impide registrar un cobro tardío. */
const LATE_SUCCESS_BLOCKING_STATUSES: ReadonlySet<string> = new Set([
  "claimed",
  "created",
  "processing",
  "requires_action",
]);

/**
 * Fase 4: cobro tardío de un intento `failed` o `canceled` (applyOutcome con
 * `late_succeeded`). Bloquea en el orden único academia → todas las cuotas de
 * la factura por id → factura → todos sus intentos por id, y con todo
 * bloqueado decide:
 * 1. el intento ya no está cerrado (otro camino lo cobró) → nada;
 * 2. otro intento de la factura ya está `succeeded` → no se registra: aviso
 *    `duplicate_collection` a la academia (D10), una vez por intento;
 * 3. otro intento sigue abierto → LATE_SUCCESS_SIBLING_IN_FLIGHT (sin
 *    escribir nada: el evento se reintenta cuando ese hermano ya se canceló);
 * 4. si no: se anulan los reintentos pendientes de la factura (`next_retry_at`
 *    de sus intentos `failed`, lo que lee listDueInvoices), porque el dinero
 *    de la cuota ya se movió;
 * 5. si todas las cuotas del intento ya están pagadas (p. ej. a mano), la
 *    familia pagó dos veces: no se registra y la academia recibe el aviso
 *    `duplicate_collection` (D10);
 * 6. si no, se registra y después se reparte el pago como un `succeeded`
 *    (recordCollectedPayment).
 */
async function applyLateSuccess(
  tx: TransactionClient,
  input: {
    organizationId: string;
    attemptId: string;
    outcome: Extract<AttemptOutcome, { kind: "late_succeeded" }>;
    environment: "test" | "live";
    now: Date;
  }
): Promise<ApplyOutcomeResult> {
  const found = await tx.execute(sql`
    select invoice_id::text as "invoiceId"
      from zaltyko.family_collection_attempts
     where organization_id = ${input.organizationId}::uuid and id = ${input.attemptId}::uuid
  `);
  const invoiceId = (found.rows[0] as { invoiceId?: unknown } | undefined)?.invoiceId;
  if (typeof invoiceId !== "string") return { applied: false };

  await lockOrganizationForSaasMutation(tx, input.organizationId);
  await lockInvoiceCharges(tx, input.organizationId, invoiceId);
  await lockInvoice(tx, input.organizationId, invoiceId);
  const locked = await tx.execute(sql`
    select ${attemptColumns}
      from zaltyko.family_collection_attempts
     where organization_id = ${input.organizationId}::uuid
       and invoice_id = ${invoiceId}::uuid
     order by id
     for update
  `);
  const attempts = (locked.rows as Array<Record<string, unknown>>).map(toAttempt);
  const attempt = attempts.find((item) => item.id === input.attemptId);
  // 1. Solo desde un intento cerrado sin cobro; si otro camino ya lo cerró
  // como cobrado (o sigue abierto), no se toca.
  if (!attempt || (attempt.status !== "failed" && attempt.status !== "canceled")) return { applied: false };
  // Un intento nunca cambia de cobro: el tardío tiene que ser el suyo.
  if (attempt.paymentIntentId !== input.outcome.paymentIntentId) {
    throw new Error("FAMILY_COLLECTION_INTENT_MISMATCH");
  }
  const siblings = attempts.filter((item) => item.id !== attempt.id);

  // 2. Nunca dos cobros de la misma factura en el libro (D10).
  const collected = siblings.find((item) => item.status === "succeeded");
  if (collected) {
    // Solo ids: la academia devuelve uno desde su panel de Stripe.
    logger.warn("Cobro automático: un cobro antiguo se completó tarde y la cuota ya estaba cobrada", {
      organizationId: attempt.organizationId,
      invoiceId: attempt.invoiceId,
      attemptId: attempt.id,
      collectedAttemptId: collected.id,
    });
    await recordTransition(tx, attempt, {
      event: "needs_review",
      payload: {
        reason: DUPLICATE_COLLECTION_REASON,
        paymentIntentId: input.outcome.paymentIntentId,
        collectedAttemptId: collected.id,
      },
      now: input.now,
    });
    return { applied: false, review: DUPLICATE_COLLECTION_REASON };
  }

  // 3. Otro intento abierto podría cobrar también: primero hay que cancelarlo
  // en Stripe (fuera de esta transacción). Se deshace todo y se reintenta.
  if (siblings.some((item) => LATE_SUCCESS_BLOCKING_STATUSES.has(item.status))) {
    throw new Error(LATE_SUCCESS_SIBLING_IN_FLIGHT);
  }

  // 4. El dinero de la cuota ya se movió: ningún reintento pendiente de la
  // factura (también el del propio intento) puede salir, se registre o no
  // este cobro (un importe que no cuadra lo revisa la academia).
  const now = input.now.toISOString();
  const cleared = await tx.execute(sql`
    update zaltyko.family_collection_attempts
       set next_retry_at = null,
           updated_at = ${now}::timestamptz
     where organization_id = ${input.organizationId}::uuid
       and invoice_id = ${invoiceId}::uuid
       and status = 'failed'
       and next_retry_at is not null
    returning id::text as "id"
  `);
  const canceledRetryAttemptIds = (cleared.rows as Array<{ id: unknown }>).map((row) => String(row.id)).sort();
  if (canceledRetryAttemptIds.length > 0) {
    await recordTransition(tx, attempt, {
      event: "pending_retry_canceled",
      payload: { reason: "late_success", canceledRetryAttemptIds },
      now: input.now,
      audit: true,
    });
  }

  // 5. Las cuotas del intento ya están pagadas (p. ej. a mano): la familia
  // pagó dos veces. Como en D10, el tardío no se registra y la academia
  // recibe el aviso `duplicate_collection` para devolver uno desde Stripe.
  const coverage = await tx.execute(sql`
    select count(*)::int as "total",
           count(*) filter (where c.status <> 'paid')::int as "notPaid"
      from zaltyko.family_collection_attempt_charges ac
      join zaltyko.charges c on c.organization_id = ac.organization_id and c.id = ac.charge_id
     where ac.organization_id = ${attempt.organizationId}::uuid
       and ac.attempt_id = ${attempt.id}::uuid
  `);
  const charges = coverage.rows[0] as { total?: unknown; notPaid?: unknown } | undefined;
  if (Number(charges?.total ?? 0) > 0 && Number(charges?.notPaid ?? 0) === 0) {
    logger.warn("Cobro automático: un cobro antiguo se completó tarde y la cuota ya estaba pagada", {
      organizationId: attempt.organizationId,
      invoiceId: attempt.invoiceId,
      attemptId: attempt.id,
    });
    await recordTransition(tx, attempt, {
      event: "needs_review",
      payload: {
        reason: DUPLICATE_COLLECTION_REASON,
        paymentIntentId: input.outcome.paymentIntentId,
        collectedAttemptId: null,
        chargesAlreadyPaid: true,
      },
      now: input.now,
    });
    return { applied: false, review: DUPLICATE_COLLECTION_REASON };
  }

  return recordCollectedPayment(tx, attempt, {
    paymentIntentId: input.outcome.paymentIntentId,
    received: input.outcome.received,
    environment: input.environment,
    now: input.now,
    late: true,
  });
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

    async isEventsStorageAvailable() {
      return isFamilyCollectionEventsStorageAvailable(db);
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
           -- N2: con un cobro tardío en espera, nunca otro intento.
           and not ${invoiceHasLatePending(sql.raw("i.organization_id"), sql.raw("i.id"))}
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
      const [charges, plan, planChangeRevision, preference, settings, account, history, reminderSent] =
        await Promise.all([
          readCharges(db, invoice.organizationId, invoice.id),
          loadOrganizationPlanState(db, invoice.organizationId),
          loadPlanChangeRevision(db, invoice.organizationId),
          readPreference(db, invoice.organizationId, invoice.familyId),
          findCollectionSettings(db, invoice.organizationId),
          readAccount(db, invoice.organizationId, input.environment),
          readHistory(db, invoice.organizationId, invoice.id),
          readReminderSent(db, invoice.organizationId, invoice.id),
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
        reminderSent,
      };
    },

    async claimOrCancel(input, decide) {
      return db.transaction(async (tx) => {
        await lockOrganizationForSaasMutation(tx, input.organizationId);
        await lockInvoiceCharges(tx, input.organizationId, input.invoiceId);
        await lockInvoice(tx, input.organizationId, input.invoiceId);

        const found = await readInvoice(tx, input.organizationId, input.invoiceId);
        if (!found) return { outcome: "skipped", reason: "invoice_missing" } as const;
        // N2: ya con la factura bloqueada. Un cobro tardío en espera (su
        // dinero ya se cobró) impide escribir otro intento, ni reclamado ni
        // cancelado: lo resuelve el paso 4 diario o la academia.
        const latePending = await tx.execute(sql`
          select ${invoiceHasLatePending(sql`${input.organizationId}::uuid`, sql`${input.invoiceId}::uuid`)} as "pending"
        `);
        if ((latePending.rows[0] as { pending?: unknown } | undefined)?.pending === true) {
          return { outcome: "skipped", reason: LATE_SUCCESS_PENDING_REASON } as const;
        }
        const charges = await readCharges(tx, input.organizationId, input.invoiceId);
        const history = await readHistory(tx, input.organizationId, input.invoiceId);
        // Ya con las cuotas bloqueadas: un recordatorio reservado antes cuenta.
        const reminderSent = await readReminderSent(tx, input.organizationId, input.invoiceId);
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

        const decision = decide({ invoice: found.invoice, charges, history, reminderSent, authorization });
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

    async findAttemptByPaymentIntent(input) {
      return findAttemptByPaymentIntentIn(db, input);
    },

    async findClaimedAttemptById(input) {
      return findClaimedAttemptByIdIn(db, input);
    },

    async listInvoiceSiblings(input) {
      const result = await db.execute(sql`
        select ${attemptColumns}
          from zaltyko.family_collection_attempts
         where organization_id = ${input.organizationId}::uuid
           and invoice_id = ${input.invoiceId}::uuid
           and id <> ${input.excludeAttemptId}::uuid
         order by attempt_number
      `);
      return (result.rows as Array<Record<string, unknown>>).map(toAttempt);
    },

    async applyOutcome(input) {
      return db.transaction(async (tx): Promise<ApplyOutcomeResult> => {
        const outcome = input.outcome;
        // Fase 4: el cobro tardío de un intento ya cerrado, con toda la factura bloqueada.
        if (outcome.kind === "late_succeeded") {
          return applyLateSuccess(tx, { ...input, outcome });
        }
        const attempt = await lockOpenAttempt(tx, input.organizationId, input.attemptId);
        if (!attempt) return { applied: false };
        const intent = outcome.paymentIntentId;
        // Un intento nunca cambia de cobro: si ya tiene uno, tiene que ser este.
        if (intent !== null && attempt.paymentIntentId !== null && attempt.paymentIntentId !== intent) {
          throw new Error("FAMILY_COLLECTION_INTENT_MISMATCH");
        }
        const now = input.now.toISOString();

        if (outcome.kind === "succeeded") {
          return recordCollectedPayment(tx, attempt, {
            paymentIntentId: outcome.paymentIntentId,
            received: outcome.received,
            environment: input.environment,
            now: input.now,
            late: false,
          });
        }

        if (outcome.kind === "requires_action") {
          // Fase 4: solo tarjeta (la base también lo exige) y sin cambiar el
          // plazo de un intento que ya espera a la familia.
          if (attempt.paymentMethodKind !== "card" || outcome.paymentIntentId === null) {
            throw new Error("FAMILY_COLLECTION_REQUIRES_ACTION_CARD_ONLY");
          }
          if (attempt.status === "requires_action") return { applied: false };
          // C2: la única escritura de action_deadline_at. Solo llega con
          // RunState.authenticationRecovery, que exige la forma "phase4".
          await tx.execute(sql`
            update zaltyko.family_collection_attempts
               set status = 'requires_action',
                   provider_payment_intent_reference = ${outcome.paymentIntentId},
                   action_deadline_at = ${outcome.actionDeadlineAt.toISOString()}::timestamptz,
                   updated_at = ${now}::timestamptz
             where organization_id = ${attempt.organizationId}::uuid
               and id = ${attempt.id}::uuid
          `);
          await recordTransition(tx, attempt, {
            event: "attempt_requires_action",
            payload: { actionDeadlineAt: outcome.actionDeadlineAt.toISOString() },
            now: input.now,
            audit: true,
          });
          // D7: aviso a la familia cada vez que el banco pide confirmar, en
          // cualquier número de intento, en la misma transacción. Misma clave
          // por intento que el aviso de fallo
          // (`family-collection:{intento}:family_failure_notice`): si el plazo
          // pasa y el intento acaba `failed`, no sale un segundo correo.
          await recordTransition(tx, attempt, { event: FAMILY_FAILURE_NOTICE, payload: {}, now: input.now });
          return { applied: true, status: "requires_action", allocationStatus: null, reviewReasons: [] };
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
          if (notifiesFamilyOnFailure({ attemptNumber: attempt.attemptNumber, failureCode: outcome.code })) {
            // D3: aviso a la familia en el primer fallo, en la misma transacción
            // que el fallo. Una sola vez por intento (clave
            // `family-collection:{intento}:family_failure_notice`, comprobada
            // antes de escribir) y solo con ids: el correo lo envía después
            // deliverFamilyFailureNotices, fuera de esta transacción.
            await recordTransition(tx, attempt, { event: FAMILY_FAILURE_NOTICE, payload: {}, now: input.now });
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
        if (notifiesFamilyOnCancel({ attemptNumber: attempt.attemptNumber, reason: outcome.reason })) {
          // La tarjeta de la familia ya no está en Stripe: el mismo aviso del
          // primer fallo (D3), para que vuelva a guardarla. Misma clave, una
          // sola vez por intento y solo con ids.
          await recordTransition(tx, attempt, { event: FAMILY_FAILURE_NOTICE, payload: {}, now: input.now });
        }
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
      // Solo el estado (nunca action_deadline_at): vale con las dos formas.
      const result = await db.execute(sql`
        select ${attemptColumns}
          from zaltyko.family_collection_attempts
         where status in ('processing', 'requires_action')
           and ${inScope(sql.raw("organization_id"), input.scope)}
           and (${input.after}::uuid is null or id > ${input.after}::uuid)
         order by id
         limit ${input.limit}
      `);
      return (result.rows as Array<Record<string, unknown>>).map(toAttempt);
    },

    async readActionDeadline(input) {
      // C2: la única lectura de action_deadline_at. Solo se llama con un
      // intento `requires_action`, que solo existe con la forma "phase4".
      const result = await db.execute(sql`
        select action_deadline_at as "actionDeadlineAt"
          from zaltyko.family_collection_attempts
         where organization_id = ${input.organizationId}::uuid
           and id = ${input.attemptId}::uuid
           and status = 'requires_action'
      `);
      const row = result.rows[0] as { actionDeadlineAt?: unknown } | undefined;
      return row ? toDateOrNull(row.actionDeadlineAt) : null;
    },

    async listLateSuccessPending(input) {
      const result = await db.execute(sql`
        select ${attemptColumns}
          from zaltyko.family_collection_attempts a
         where ${latePendingAttempt("a")}
           and ${inScope(sql.raw("a.organization_id"), input.scope)}
           and (${input.after}::uuid is null or a.id > ${input.after}::uuid)
         order by a.id
         limit ${input.limit}
      `);
      return (result.rows as Array<Record<string, unknown>>).map(toAttempt);
    },

    async listUnallocatedRefundAttempts(input) {
      const result = await db.execute(sql`
        select ${attemptColumns}
          from zaltyko.family_collection_attempts a
         where a.status = 'succeeded'
           and a.provider_payment_intent_reference is not null
           and ${inScope(sql.raw("a.organization_id"), input.scope)}
           and (${input.after}::uuid is null or a.id > ${input.after}::uuid)
           and exists (
             select 1 from zaltyko.outbox_events e
              where e.organization_id = a.organization_id
                and e.event_name = ${NEEDS_REVIEW_EVENT}
                and e.aggregate_id = a.id
                and e.payload->>'reason' = ${REFUND_UNALLOCATED_REASON}
                and e.occurred_at >= ${input.since.toISOString()}::timestamptz
                and not exists (
                  select 1 from zaltyko.refunds r
                   where r.organization_id = a.organization_id
                     and r.processor = ${FAMILY_COLLECTION_PROCESSOR}
                     and r.environment = 'sandbox'::zaltyko.provider_environment
                     and starts_with(r.provider_refund_id, (e.payload->>'providerRefundReference') || ':')
                )
           )
         order by a.id
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
               -- Ventana de cobro (collectionWindowAnchor): el intento anterior,
               -- el día de cobro de la academia y el vencimiento más antiguo
               -- de las cuotas del reparto. Solo columnas de la Fase 3.
               prev_attempt.status as "previousStatus",
               prev_attempt.next_retry_at as "previousNextRetryAt",
               (
                 select ocs.collection_day_of_month
                   from zaltyko.organization_collection_settings ocs
                  where ocs.organization_id = a.organization_id
               ) as "collectionDayOfMonth",
               (
                 select min(c.due_at)
                   from zaltyko.family_collection_attempt_charges ac
                   join zaltyko.charges c on c.organization_id = ac.organization_id and c.id = ac.charge_id
                  where ac.organization_id = a.organization_id and ac.attempt_id = a.id
               ) as "earliestDueAt",
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
               ) as "authorizationMatches",
               coalesce(au.status = 'active'::zaltyko.payment_authorization_status, false) as "authorizationActive"
          from zaltyko.family_collection_attempts a
          join zaltyko.organization_payment_provider_accounts acc
            on acc.organization_id = a.organization_id and acc.id = a.payment_provider_account_id
          join zaltyko.locations l
            on l.organization_id = a.organization_id and l.id = a.location_id
          left join zaltyko.family_payment_authorizations au
            on au.organization_id = a.organization_id and au.id = a.authorization_id
          left join zaltyko.family_collection_attempts prev_attempt
            on prev_attempt.organization_id = a.organization_id
           and prev_attempt.invoice_id = a.invoice_id
           and prev_attempt.attempt_number = a.attempt_number - 1
         where a.organization_id = ${attempt.organizationId}::uuid
           and a.id = ${attempt.id}::uuid
         limit 1
      `);
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      // La autorización del intento debe ser del pagador, la familia y la cuenta
      // del intento (ninguna clave foránea lo ata): si no, no hay con qué cobrar.
      const matches = row.authorizationMatches === true;
      const timezone = String(row.timezone);
      const allocations = await readAllocations(db, attempt);
      return {
        connectedAccount: String(row.connectedAccount),
        customer: matches ? toStringOrNull(row.customer) : null,
        paymentMethod: matches ? toStringOrNull(row.paymentMethod) : null,
        mandate: matches ? toStringOrNull(row.mandate) : null,
        timezone,
        servicePeriodStart: toStringOrNull(row.servicePeriodStart),
        firstAttemptClaimedAt: toDateOrNull(row.firstAttemptClaimedAt),
        allocations,
        windowAnchorLocalDate: windowAnchorOf(row, attempt.attemptNumber, timezone),
        authorizationActive: matches && row.authorizationActive === true,
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

/**
 * Motivo (`failure_code`) con el que la academia cierra un intento:
 * - `canceled_by_academy`: «Cancelar el cobro automático»;
 * - `reviewed_by_academy`: «Marcar como revisado» tras comprobar en Stripe
 *   que no se movió dinero (o que ya está en el libro);
 * - `reviewed_unverifiable`: «Marcar como revisado» sin poder saber si se
 *   cobró (Stripe no deja leerlo por un error permanente, o cobró otro
 *   importe, que no se registra). La academia lo comprueba en su panel.
 */
export type AcademyCloseReason = "canceled_by_academy" | "reviewed_by_academy" | "reviewed_unverifiable";

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
        input.reason === "canceled_by_academy"
          ? "family_collection.attempt_canceled"
          : "family_collection.attempt_reviewed",
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

// ---------------------------------------------------------------------------
// Fase 4 (Tarea 6): devoluciones que la academia hizo desde su panel de Stripe
// (D5). Nunca se borra ni se cambia un pago ni un reparto: devolver es
// escribir filas en zaltyko.refunds (recordProviderRefund) y la cuota sigue
// pagada (D1). Sin llamadas a Stripe: lo que dice Stripe llega ya leído.
// ---------------------------------------------------------------------------

/** Una devolución de Stripe, ya releída por id en la cuenta conectada. */
export interface ProviderRefund {
  /** `re_…` (tarjeta) o `pyr_…` (domiciliación). */
  id: string;
  amountCents: number;
  /** En mayúsculas (`EUR`). */
  currency: string;
  /** Motivo de Stripe o `requested_by_academy` (refundReasonCode). */
  reasonCode: string;
  refundedAt: Date;
}

export type AttemptRefundResult =
  /** Filas nuevas en zaltyko.refunds (una por reparto), el pago al día y el aviso `refunded`. */
  | { outcome: "recorded"; refundIds: string[]; paymentStatus: "partially_refunded" | "refunded" }
  /** Ese `re_…` ya tenía sus filas: no se escribe nada. */
  | { outcome: "already_recorded" }
  /** El intento no está cobrado con ese `pi_…` (o no tiene pago): no hay nada que devolver en el libro. */
  | { outcome: "not_collected" };

export interface FamilyCollectionRefundStore {
  /** Almacenamiento de las Fases 1–3 y forma "phase4". */
  isStorageAvailable(): Promise<boolean>;
  /** El intento de esa academia con ese `pi_…`, o null. Sin transacción. */
  findAttemptByPaymentIntent(input: { organizationId: string; paymentIntentId: string }): Promise<CollectionAttempt | null>;
  /**
   * El intento de esa academia con ese id, solo si sigue `claimed`; si no,
   * null. Sin transacción. Lo usa la devolución que llega antes que el cobro
   * para decidir si pedir el reenvío (el mismo criterio que la adopción del
   * camino de los cobros).
   */
  findClaimedAttemptById(input: { organizationId: string; attemptId: string }): Promise<CollectionAttempt | null>;
  /** ¿Tiene ya ese `re_…` sus filas en zaltyko.refunds? Sin transacción. */
  isRefundRecorded(input: { organizationId: string; environment: "test" | "live"; refundId: string }): Promise<boolean>;
  /**
   * Una transacción con el orden único (academia → cuotas → factura →
   * intento → pago): anota la devolución entera, una fila por reparto
   * (splitRefund), con su outbox `payment.refunded` por fila y el aviso
   * `refunded`. Si no cabe en lo repartido, lanza RefundDoesNotFitError y no
   * queda ninguna fila. Idempotente por el `re_…` y por la clave de cada fila.
   */
  recordAttemptRefunds(input: {
    organizationId: string;
    attemptId: string;
    paymentIntentId: string;
    refund: ProviderRefund;
    /**
     * Fila del buzón (payment_provider_events.id) del evento; null cuando las
     * anota el cobro tardío al registrarse (Tarea 7), sin evento propio.
     */
    providerEventId: string | null;
    environment: "test" | "live";
    now: Date;
  }): Promise<AttemptRefundResult>;
  /**
   * Aviso de una devolución a la academia (`refund_unallocated`,
   * `refund_reversed`), una vez por intento, motivo y `re_…` (C13). `true` si
   * lo escribió.
   */
  recordRefundNotice(input: {
    attempt: CollectionAttempt;
    reason: string;
    refundId: string;
    amountCents: number;
    currency: string;
    now: Date;
  }): Promise<boolean>;
}

export function ledgerEnvironmentOf(environment: "test" | "live"): "sandbox" | "live" {
  return environment === "test" ? "sandbox" : "live";
}

/** ¿Tiene ya ese `re_…` alguna fila? Todas las de un `re_…` se escriben juntas: una basta. */
async function refundRecorded(
  executor: Executor,
  input: { organizationId: string; environment: "test" | "live"; refundId: string }
): Promise<boolean> {
  const result = await executor.execute(sql`
    select 1 as "found"
      from zaltyko.refunds
     where organization_id = ${input.organizationId}::uuid
       and processor = ${FAMILY_COLLECTION_PROCESSOR}
       and environment = ${ledgerEnvironmentOf(input.environment)}::zaltyko.provider_environment
       and starts_with(provider_refund_id, ${`${input.refundId}:`})
     limit 1
  `);
  return result.rows.length > 0;
}

/** Repartos del pago con su cuota y lo ya devuelto de cada uno. */
async function readRefundableAllocations(
  tx: TransactionClient,
  organizationId: string,
  paymentId: string
): Promise<RefundableAllocation[]> {
  const result = await tx.execute(sql`
    select pa.id::text as "allocationId",
           pa.charge_id::text as "chargeId",
           pa.amount_cents::text as "allocatedCents",
           coalesce(to_char(c.service_period_start, 'YYYY-MM-DD'), '') as "servicePeriodStart",
           coalesce((
             select sum(r.amount_cents)
               from zaltyko.refunds r
              where r.organization_id = pa.organization_id
                and r.payment_allocation_id = pa.id
                and r.status = 'succeeded'
           ), 0)::text as "refundedCents"
      from zaltyko.payment_allocations pa
      join zaltyko.charges c
        on c.organization_id = pa.organization_id and c.id = pa.charge_id
     where pa.organization_id = ${organizationId}::uuid
       and pa.payment_id = ${paymentId}::uuid
     order by c.service_period_start, pa.charge_id, pa.id
  `);
  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    allocationId: String(row.allocationId),
    chargeId: String(row.chargeId),
    servicePeriodStart: String(row.servicePeriodStart),
    allocatedCents: toCents(row.allocatedCents),
    refundedCents: toCents(row.refundedCents),
  }));
}

function isRefundExceedsAllocation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "REFUND_EXCEEDS_ALLOCATION"
  );
}

/**
 * Escribe todas las filas de una devolución (o, en la Tarea 7, de una disputa
 * perdida) dentro de la transacción de quien llama, que ya tiene bloqueados
 * la academia, las cuotas, la factura y el intento (y la disputa) y el pago.
 * Reparte de la cuota más antigua a la más nueva; si no cabe entera (pago sin
 * repartir, repartido en parte, o devoluciones anteriores que ya lo agotan),
 * lanza RefundDoesNotFitError para deshacer la transacción: o todas las
 * filas o ninguna. Una fila por reparto, con su referencia
 * `{re_…}:{reparto}` y su clave `refund:{re_…}:{reparto}`, y un outbox
 * `payment.refunded` por fila con esa misma clave (C12).
 */
export async function recordSplitRefund(
  tx: TransactionClient,
  input: {
    organizationId: string;
    locationId: string;
    paymentId: string;
    /** `re_…`/`pyr_…` (o `dp_…`/`du_…` en la Tarea 7). */
    reference: string;
    amountCents: number;
    currency: string;
    reasonCode: string;
    refundedAt: Date;
    providerEventId: string | null;
    environment: "test" | "live";
    now: Date;
  }
): Promise<{ refundIds: string[]; paymentStatus: "partially_refunded" | "refunded" }> {
  const paymentRow = await tx.execute(sql`
    select currency from zaltyko.payments
     where organization_id = ${input.organizationId}::uuid and id = ${input.paymentId}::uuid
  `);
  const paymentCurrency = (paymentRow.rows[0] as { currency?: unknown } | undefined)?.currency;
  if (paymentCurrency !== input.currency) throw new RefundDoesNotFitError();

  const parts = splitRefund({
    allocations: await readRefundableAllocations(tx, input.organizationId, input.paymentId),
    amountCents: input.amountCents,
  });
  if (!parts || parts.length === 0) throw new RefundDoesNotFitError();

  const refundIds: string[] = [];
  let paymentStatus: "partially_refunded" | "refunded" = "partially_refunded";
  for (const part of parts) {
    const idempotencyKey = providerRefundIdempotencyKey(input.reference, part.allocationId);
    let recorded: Awaited<ReturnType<typeof recordProviderRefund>>;
    try {
      recorded = await recordProviderRefund(tx, {
        organizationId: input.organizationId,
        paymentId: input.paymentId,
        paymentAllocationId: part.allocationId,
        amountCents: part.amountCents,
        currency: input.currency,
        processor: FAMILY_COLLECTION_PROCESSOR,
        environment: ledgerEnvironmentOf(input.environment),
        providerRefundId: providerRefundReference(input.reference, part.allocationId),
        reasonCode: input.reasonCode,
        refundedAt: input.refundedAt,
        providerEventId: input.providerEventId,
        idempotencyKey,
      });
    } catch (error) {
      // El libro siempre dice REFUND_EXCEEDS_ALLOCATION (el camino simulado
      // no cambia); aquí es una devolución que no cabe: se deshace todo.
      if (isRefundExceedsAllocation(error)) throw new RefundDoesNotFitError();
      throw error;
    }
    paymentStatus = recorded.paymentStatus;
    if (!recorded.created) continue;
    refundIds.push(recorded.refundId);
    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      eventName: "payment.refunded",
      aggregateType: "refund",
      aggregateId: recorded.refundId,
      idempotencyKey,
      payload: {
        refundId: recorded.refundId,
        paymentId: input.paymentId,
        paymentAllocationId: part.allocationId,
        amountCents: part.amountCents,
        currency: input.currency,
      },
      occurredAt: input.now,
    });
  }
  return { refundIds, paymentStatus };
}

/** Aviso de una devolución (clave con su `re_…`, C13), dentro de la transacción de quien llama. */
async function appendRefundNotice(
  tx: TransactionClient,
  input: {
    attempt: CollectionAttempt;
    reason: string;
    refundId: string;
    amountCents: number;
    currency: string;
    now: Date;
  }
): Promise<boolean> {
  const eventName = NEEDS_REVIEW_EVENT;
  const idempotencyKey = needsReviewKey({
    attemptId: input.attempt.id,
    invoiceId: input.attempt.invoiceId,
    reason: input.reason,
    reference: input.refundId,
  });
  if (await findOutboxEvent(tx, { organizationId: input.attempt.organizationId, eventName, idempotencyKey })) {
    return false;
  }
  // Solo ids, la referencia opaca de Stripe, el importe y la moneda.
  await appendOutboxEvent(tx, {
    organizationId: input.attempt.organizationId,
    locationId: input.attempt.locationId,
    eventName,
    aggregateType: "family_collection_attempt",
    aggregateId: input.attempt.id,
    idempotencyKey,
    payload: {
      attemptId: input.attempt.id,
      invoiceId: input.attempt.invoiceId,
      reason: input.reason,
      providerRefundReference: input.refundId,
      amountCents: input.amountCents,
      currency: input.currency,
    },
    occurredAt: input.now,
  });
  return true;
}

export function createFamilyCollectionRefundStore(): FamilyCollectionRefundStore {
  return {
    async isStorageAvailable() {
      const [collection, events, paymentMethods, connect] = await Promise.all([
        isFamilyCollectionStorageAvailable(db),
        isFamilyCollectionEventsStorageAvailable(db),
        isFamilyPaymentMethodsStorageAvailable(db),
        isConnectOnboardingStorageAvailable(db),
      ]);
      return collection && events && paymentMethods && connect;
    },

    async findAttemptByPaymentIntent(input) {
      return findAttemptByPaymentIntentIn(db, input);
    },

    async findClaimedAttemptById(input) {
      return findClaimedAttemptByIdIn(db, input);
    },

    async isRefundRecorded(input) {
      return refundRecorded(db, input);
    },

    async recordAttemptRefunds(input) {
      return db.transaction(async (tx): Promise<AttemptRefundResult> => {
        const found = await tx.execute(sql`
          select invoice_id::text as "invoiceId"
            from zaltyko.family_collection_attempts
           where organization_id = ${input.organizationId}::uuid and id = ${input.attemptId}::uuid
        `);
        const invoiceId = (found.rows[0] as { invoiceId?: unknown } | undefined)?.invoiceId;
        if (typeof invoiceId !== "string") return { outcome: "not_collected" };

        // Orden único (C18): academia → cuotas por id → factura → intento → pago.
        await lockOrganizationForSaasMutation(tx, input.organizationId);
        await lockAttemptCharges(tx, input.organizationId, input.attemptId);
        await lockInvoice(tx, input.organizationId, invoiceId);
        const locked = await tx.execute(sql`
          select ${attemptColumns}, payment_id::text as "paymentId"
            from zaltyko.family_collection_attempts
           where organization_id = ${input.organizationId}::uuid
             and id = ${input.attemptId}::uuid
           for update
        `);
        const row = locked.rows[0] as Record<string, unknown> | undefined;
        if (!row) return { outcome: "not_collected" };
        const attempt = toAttempt(row);
        const paymentId = toStringOrNull(row.paymentId);
        if (attempt.status !== "succeeded" || paymentId === null || attempt.paymentIntentId !== input.paymentIntentId) {
          return { outcome: "not_collected" };
        }
        await tx.execute(sql`
          select id from zaltyko.payments
           where organization_id = ${input.organizationId}::uuid and id = ${paymentId}::uuid
           for update
        `);
        if (
          await refundRecorded(tx, {
            organizationId: input.organizationId,
            environment: input.environment,
            refundId: input.refund.id,
          })
        ) {
          return { outcome: "already_recorded" };
        }

        const { refundIds, paymentStatus } = await recordSplitRefund(tx, {
          organizationId: input.organizationId,
          locationId: attempt.locationId,
          paymentId,
          reference: input.refund.id,
          amountCents: input.refund.amountCents,
          currency: input.refund.currency,
          reasonCode: input.refund.reasonCode,
          refundedAt: input.refund.refundedAt,
          providerEventId: input.providerEventId,
          environment: input.environment,
          now: input.now,
        });
        // Aviso informativo: la cuota sigue pagada, marcada «Devuelta» (D1).
        await appendRefundNotice(tx, {
          attempt,
          reason: REFUNDED_NOTICE_REASON,
          refundId: input.refund.id,
          amountCents: input.refund.amountCents,
          currency: input.refund.currency,
          now: input.now,
        });
        return { outcome: "recorded", refundIds, paymentStatus };
      });
    },

    async recordRefundNotice(input) {
      return db.transaction((tx) => appendRefundNotice(tx, input));
    },
  };
}

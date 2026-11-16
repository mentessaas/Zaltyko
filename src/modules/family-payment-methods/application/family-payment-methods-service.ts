/**
 * Pago automático de cuotas (cobro automático, Fase 2): servicio de
 * aplicación. La persona pagadora de una familia guarda una tarjeta o una
 * domiciliación en la cuenta Stripe conectada de su academia; en esta fase no
 * se cobra nada.
 *
 * Reglas que no se rompen aquí:
 * - Ninguna llamada a Stripe dentro de `db.transaction`: primero se lee o
 *   crea en Stripe y después se escribe en una transacción corta.
 * - Nunca se confía en el navegador: la preparación (seti_) se busca por la
 *   referencia guardada en el intento de esa persona pagadora y se comprueba
 *   con lo que dice Stripe.
 * - Revocar marca primero `revoked` (eso impide cobrar) y después desliga el
 *   método en Stripe; si Stripe falla, la revocación se mantiene.
 * - En logs, auditoría, eventos y Stripe solo van ids y referencias opacas;
 *   nunca IP, agente de navegador, nombres ni datos del método.
 */
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import { logger } from "@/lib/logger";
import { loadOrganizationPlanState } from "@/modules/billing/application/plan-state";
import {
  isFamilyPaymentMethodsFlagEnabled,
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-payment-methods/application/config";
import { isFamilyPaymentMethodsStorageAvailable } from "@/modules/family-payment-methods/application/storage";
import {
  evaluateFamilyPaymentMethodAvailability,
  type FamilyPaymentUnavailableReason,
} from "@/modules/family-payment-methods/domain/availability";
import {
  consentTextSha256,
  FAMILY_PAYMENT_CONSENT_VERSION,
  renderConsentText,
  type PaymentMethodKind,
} from "@/modules/family-payment-methods/domain/consent";
import { truncateClientIp, truncateUserAgent } from "@/modules/family-payment-methods/domain/evidence";
import { verifyCompletedSetupIntent } from "@/modules/family-payment-methods/domain/setup-verification";
import {
  findActiveAuthorization,
  findLatestCustomerReference,
  findSetupAttemptForPayer,
  insertActiveAuthorization,
  insertSetupAttempt,
  listActiveAuthorizationsForOrganization,
  loadOrganizationName,
  lockActiveAuthorization,
  lockActiveAuthorizationById,
  lockSetupAttempt,
  markSetupAttemptAbandoned,
  markSetupAttemptCompleted,
  resolveFamilyPayer,
  revokeAuthorization,
  type FamilyPayer,
  type StoredAuthorization,
} from "@/modules/family-payment-methods/infrastructure/family-payment-store";
import {
  createStripeFamilyGateway,
  familyCustomerIdempotencyKey,
  type FamilyPaymentGateway,
} from "@/modules/family-payment-methods/infrastructure/stripe-family-gateway";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";
import {
  findConnectAccountForOrganization,
  type StoredConnectAccount,
} from "@/modules/payments-connect/infrastructure/connect-account-store";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import {
  isRetryableDbConflict,
  retryableDbConflictError,
} from "@/modules/shared/infrastructure/retryable-db-conflict";
import {
  appendAuditEntry,
  appendOutboxEvent,
} from "@/modules/shared/infrastructure/transactional-records";

type ConsentTexts = Partial<Record<PaymentMethodKind, string>>;

export type FamilyPaymentMethodState =
  | { kind: "unavailable"; reason: FamilyPaymentUnavailableReason }
  | {
      kind: "none";
      kinds: PaymentMethodKind[];
      academyName: string;
      consentVersion: string;
      consentTexts: ConsentTexts;
    }
  | {
      kind: "active";
      method: PaymentMethodKind;
      since: string;
      kinds: PaymentMethodKind[];
      academyName: string;
      consentVersion: string;
      consentTexts: ConsentTexts;
    };

export interface FamilyPaymentMethodsDeps {
  gateway?: FamilyPaymentGateway;
}

const AUDIT_TARGET_TYPE = "family_payment_authorization";
const ATTEMPT_AGGREGATE_TYPE = "family_payment_setup_attempt";
/** Esta fase solo existe con clave de test (los dos cerrojos de la Fase 1). */
const ENVIRONMENT = "test" as const;
const OWNER_LIST_LIMIT = 200;

/** Motivos que no dependen de la persona ni de la academia: se miran primero. */
const GATE_REASONS: ReadonlySet<FamilyPaymentUnavailableReason> = new Set([
  "flag_off",
  "environment_unknown",
  "live_not_released",
  "storage_missing",
]);

const familyInputSchema = z.object({
  userId: z.guid(),
  organizationId: z.guid(),
  familyId: z.guid(),
});

const startInputSchema = familyInputSchema.extend({
  kind: z.enum(["card", "sepa_debit"]),
  // Se comprueban a mano para responder 400 con un código propio.
  consentVersion: z.unknown(),
  consentAccepted: z.unknown(),
  clientIp: z.string().nullable(),
  userAgent: z.string().nullable(),
});

const completeInputSchema = familyInputSchema.extend({
  setupIntentId: z.string().max(255).regex(/^seti_[A-Za-z0-9]+$/),
});

const ownerInputSchema = z.object({
  userId: z.guid(),
  organizationId: z.guid(),
});

const ownerRevokeInputSchema = ownerInputSchema.extend({
  authorizationId: z.guid(),
});

function gatewayFrom(deps: FamilyPaymentMethodsDeps | undefined): FamilyPaymentGateway {
  return deps?.gateway ?? createStripeFamilyGateway();
}

function unavailableError(reason: FamilyPaymentUnavailableReason): OperationalError {
  return new OperationalError(
    "FEATURE_NOT_AVAILABLE",
    "El pago automático no está disponible ahora mismo.",
    503,
    { reason }
  );
}

function notFoundError(): OperationalError {
  // Nunca dice si la familia existe: lo mismo para «no existe» y «no eres la pagadora».
  return new OperationalError("NOT_FOUND", "No encontramos este pago automático.", 404);
}

function setupFailedError(): OperationalError {
  return new OperationalError(
    "FAMILY_PAYMENT_SETUP_FAILED",
    "No se pudo guardar el método de pago. Vuelve a intentarlo.",
    409
  );
}

function notOfferedError(): OperationalError {
  return new OperationalError(
    "FAMILY_PAYMENT_METHOD_NOT_OFFERED",
    "Tu academia no acepta ahora mismo este método de pago.",
    409
  );
}

function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth += 1) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

interface GateInputs {
  flagEnabled: boolean;
  environment: "test" | "live" | null;
  productionDatabase: boolean;
  storageAvailable: boolean;
}

type Gate = { open: true; inputs: GateInputs } | { open: false; reason: FamilyPaymentUnavailableReason };

/**
 * Bandera, entorno, base y almacenamiento. Sin bandera, fuera de `test` o
 * contra la base de producción no se consulta la base.
 */
async function loadGate(organizationId: string, now: Date): Promise<Gate> {
  const flagEnabled = isFamilyPaymentMethodsFlagEnabled();
  const environment = resolveConnectEnvironment();
  const productionDatabase = isProductionDatabase();
  let storageAvailable = false;
  if (flagEnabled && environment === ENVIRONMENT && !productionDatabase) {
    // La tabla de intentos y las columnas de la cuenta conectada (Fase 1).
    const [family, connect] = await Promise.all([
      isFamilyPaymentMethodsStorageAvailable(),
      isConnectOnboardingStorageAvailable(),
    ]);
    storageAvailable = family && connect;
  }
  const inputs = { flagEnabled, environment, productionDatabase, storageAvailable };
  const result = evaluateFamilyPaymentMethodAvailability({
    ...inputs,
    isPayer: true,
    account: null,
    planState: { entitlement: null, subscription: null },
    organizationId,
    now,
  });
  if (!result.available && GATE_REASONS.has(result.reason)) {
    return { open: false, reason: result.reason };
  }
  return { open: true, inputs };
}

interface AcademyContext {
  account: StoredConnectAccount | null;
  academyName: string;
  kinds: PaymentMethodKind[] | null;
  reason: FamilyPaymentUnavailableReason | null;
}

/** Cuenta conectada, plan y nombre de la academia, y la disponibilidad completa. */
async function loadAcademyContext(
  gate: GateInputs,
  organizationId: string,
  isPayer: boolean,
  now: Date
): Promise<AcademyContext> {
  const [account, planState, academyName] = await Promise.all([
    findConnectAccountForOrganization(db, organizationId, ENVIRONMENT),
    loadOrganizationPlanState(db, organizationId),
    loadOrganizationName(db, organizationId),
  ]);
  if (academyName === null) throw new Error("Family payment methods: academy row missing");
  const availability = evaluateFamilyPaymentMethodAvailability({
    ...gate,
    isPayer,
    account: account
      ? {
          status: account.status,
          cardPaymentsCapabilityStatus: account.cardPaymentsCapabilityStatus,
          sepaDebitPaymentsCapabilityStatus: account.sepaDebitPaymentsCapabilityStatus,
        }
      : null,
    planState,
    organizationId,
    now,
  });
  return availability.available
    ? { account, academyName, kinds: availability.kinds, reason: null }
    : { account, academyName, kinds: null, reason: availability.reason };
}

interface WritableContext {
  payer: FamilyPayer;
  account: StoredConnectAccount;
  academyName: string;
  kinds: PaymentMethodKind[];
}

/**
 * Orden de comprobaciones de una escritura: almacenamiento y entorno (503),
 * persona pagadora (404), academia lista y plan (503).
 */
async function requireWritableContext(
  input: { userId: string; organizationId: string; familyId: string },
  now: Date
): Promise<WritableContext> {
  const gate = await loadGate(input.organizationId, now);
  if (!gate.open) throw unavailableError(gate.reason);
  const payer = await resolveFamilyPayer(db, {
    userId: input.userId,
    organizationId: input.organizationId,
    familyId: input.familyId,
    now,
  });
  if (!payer) throw notFoundError();
  const context = await loadAcademyContext(gate.inputs, input.organizationId, true, now);
  if (context.reason !== null || context.kinds === null) {
    throw unavailableError(context.reason ?? "account_not_ready");
  }
  if (!context.account) throw unavailableError("account_not_ready");
  return { payer, account: context.account, academyName: context.academyName, kinds: context.kinds };
}

function consentTextsFor(kinds: PaymentMethodKind[], academyName: string): ConsentTexts {
  const texts: ConsentTexts = {};
  for (const kind of kinds) {
    texts[kind] = renderConsentText({ kind, academyName, version: FAMILY_PAYMENT_CONSENT_VERSION });
  }
  return texts;
}

/** Desliga el método en Stripe tras el commit. Un fallo se registra y no deshace nada. */
async function detachAfterRevocation(
  gateway: FamilyPaymentGateway,
  input: { connectedAccount: string; authorization: StoredAuthorization }
): Promise<void> {
  try {
    await gateway.detachPaymentMethod({
      connectedAccount: input.connectedAccount,
      paymentMethod: input.authorization.paymentMethodReference,
    });
  } catch (error) {
    logger.error("Pago automático: método revocado sin desligar en Stripe", error, {
      organizationId: input.authorization.organizationId,
      authorizationId: input.authorization.id,
      accountId: input.connectedAccount,
      paymentMethodId: input.authorization.paymentMethodReference,
    });
  }
}

/** Marca `revoked` una autorización ya bloqueada y deja auditoría y evento. */
async function revokeLockedAuthorization(
  tx: TransactionClient,
  authorization: StoredAuthorization,
  input: { actor: "family" | "owner"; actorUserId: string; reason: "requested" | "replaced"; now: Date }
): Promise<void> {
  await revokeAuthorization(tx, {
    organizationId: authorization.organizationId,
    authorizationId: authorization.id,
    now: input.now,
  });
  const idempotencyKey = `family-payment-methods:authorization-revoked:${authorization.id}`;
  const details = {
    authorizationId: authorization.id,
    familyId: authorization.familyId,
    familyPayerId: authorization.familyPayerId,
    paymentProviderAccountId: authorization.paymentProviderAccountId,
    kind: authorization.paymentMethodKind,
    actor: input.actor,
    reason: input.reason,
  };
  await appendAuditEntry(tx, {
    organizationId: authorization.organizationId,
    locationId: null,
    actorUserId: input.actorUserId,
    action: "family_payment_methods.authorization_revoked",
    targetType: AUDIT_TARGET_TYPE,
    targetId: authorization.id,
    idempotencyKey,
    before: { status: "active" },
    after: { status: "revoked" },
    metadata: details,
  });
  await appendOutboxEvent(tx, {
    organizationId: authorization.organizationId,
    locationId: null,
    eventName: "family_payment_methods.authorization_revoked",
    aggregateType: AUDIT_TARGET_TYPE,
    aggregateId: authorization.id,
    idempotencyKey,
    payload: details,
    occurredAt: input.now,
  });
}

/** Estado del pago automático de una familia para el portal. */
export async function getFamilyPaymentMethodState(
  input: { userId: string; organizationId: string; familyId: string; now?: Date },
  // Sin Stripe: se acepta por simetría con el resto de funciones.
  _deps?: FamilyPaymentMethodsDeps
): Promise<FamilyPaymentMethodState> {
  const parsed = familyInputSchema.parse(input);
  const now = input.now ?? new Date();
  const gate = await loadGate(parsed.organizationId, now);
  if (!gate.open) return { kind: "unavailable", reason: gate.reason };

  const payer = await resolveFamilyPayer(db, { ...parsed, now });
  if (!payer) return { kind: "unavailable", reason: "not_payer" };

  const context = await loadAcademyContext(gate.inputs, parsed.organizationId, true, now);
  const active = context.account
    ? await findActiveAuthorization(db, {
        organizationId: parsed.organizationId,
        accountRowId: context.account.id,
        familyPayerId: payer.familyPayerId,
      })
    : null;
  const common = { academyName: context.academyName, consentVersion: FAMILY_PAYMENT_CONSENT_VERSION };

  if (context.kinds === null) {
    // Si la academia deja de estar lista, la familia sigue viendo su método
    // para poder dejar de pagar automáticamente; no puede cambiarlo.
    if (active) {
      return {
        kind: "active",
        method: active.paymentMethodKind,
        since: active.consentedAt.toISOString(),
        kinds: [],
        ...common,
        consentTexts: {},
      };
    }
    return { kind: "unavailable", reason: context.reason ?? "account_not_ready" };
  }

  const consentTexts = consentTextsFor(context.kinds, context.academyName);
  if (active) {
    return {
      kind: "active",
      method: active.paymentMethodKind,
      since: active.consentedAt.toISOString(),
      kinds: context.kinds,
      ...common,
      consentTexts,
    };
  }
  return { kind: "none", kinds: context.kinds, ...common, consentTexts };
}

/**
 * Empieza a guardar un método: valida, reutiliza o crea el cliente en la
 * cuenta de la academia, crea la preparación en Stripe y guarda el intento
 * con la evidencia del consentimiento. Devuelve lo que necesita el formulario
 * de Stripe y nada más.
 */
export async function startFamilyPaymentSetup(
  input: {
    userId: string;
    organizationId: string;
    familyId: string;
    kind: PaymentMethodKind;
    consentVersion: string;
    consentAccepted: true;
    clientIp: string | null;
    userAgent: string | null;
    now?: Date;
  },
  deps?: FamilyPaymentMethodsDeps
): Promise<{ clientSecret: string; connectedAccount: string; setupIntentId: string }> {
  const parsed = startInputSchema.parse(input);
  const now = input.now ?? new Date();
  if (parsed.consentAccepted !== true || parsed.consentVersion !== FAMILY_PAYMENT_CONSENT_VERSION) {
    throw new OperationalError(
      "FAMILY_PAYMENT_CONSENT_REQUIRED",
      "Lee y acepta el texto del pago automático para continuar.",
      400
    );
  }

  const context = await requireWritableContext(parsed, now);
  if (!context.kinds.includes(parsed.kind)) throw notOfferedError();

  const organizationId = parsed.organizationId;
  const { payer, account } = context;
  // El texto exacto que se mostró, con el nombre de la academia de la base.
  const consentText = renderConsentText({
    kind: parsed.kind,
    academyName: context.academyName,
    version: FAMILY_PAYMENT_CONSENT_VERSION,
  });
  const gateway = gatewayFrom(deps);

  // Fuera de transacción: Stripe nunca dentro de una transacción abierta.
  let customer = await findLatestCustomerReference(db, {
    organizationId,
    accountRowId: account.id,
    familyPayerId: payer.familyPayerId,
  });
  if (!customer) {
    const created = await gateway.createCustomer({
      connectedAccount: account.providerAccountReference,
      organizationId,
      familyPayerId: payer.familyPayerId,
      idempotencyKey: familyCustomerIdempotencyKey(account.id, payer.familyPayerId),
    });
    customer = created.id;
  }

  const attemptId = randomUUID();
  const setupIntent = await gateway.createSetupIntent({
    connectedAccount: account.providerAccountReference,
    customer,
    kind: parsed.kind,
    organizationId,
    familyPayerId: payer.familyPayerId,
    attemptId,
  });

  const customerReference = customer;
  try {
    await db.transaction(async (tx) => {
      await insertSetupAttempt(tx, {
        id: attemptId,
        organizationId,
        familyId: parsed.familyId,
        familyPayerId: payer.familyPayerId,
        guardianId: payer.guardianId,
        accountRowId: account.id,
        kind: parsed.kind,
        customerReference,
        setupReference: setupIntent.id,
        consentVersion: FAMILY_PAYMENT_CONSENT_VERSION,
        consentTextSha256: consentTextSha256(consentText),
        consentedAt: now,
        clientIpPrefix: truncateClientIp(parsed.clientIp),
        userAgentExcerpt: truncateUserAgent(parsed.userAgent),
      });
      // Sin IP ni agente: esos solo viven en la fila del intento.
      const details = {
        attemptId,
        familyId: parsed.familyId,
        familyPayerId: payer.familyPayerId,
        paymentProviderAccountId: account.id,
        kind: parsed.kind,
        consentVersion: FAMILY_PAYMENT_CONSENT_VERSION,
      };
      const idempotencyKey = `family-payment-methods:setup-started:${attemptId}`;
      await appendAuditEntry(tx, {
        organizationId,
        locationId: null,
        actorUserId: parsed.userId,
        action: "family_payment_methods.setup_started",
        // Todavía no hay autorización: el intento va en metadata.
        targetType: AUDIT_TARGET_TYPE,
        targetId: null,
        idempotencyKey,
        metadata: details,
      });
      await appendOutboxEvent(tx, {
        organizationId,
        locationId: null,
        eventName: "family_payment_methods.setup_started",
        aggregateType: ATTEMPT_AGGREGATE_TYPE,
        aggregateId: attemptId,
        idempotencyKey,
        payload: details,
        occurredAt: now,
      });
    });
  } catch (error) {
    // La preparación existe en Stripe pero no se entregó su clientSecret: queda
    // huérfana y caduca sola. Solo ids.
    logger.warn("Pago automático: preparación creada en Stripe sin guardar", {
      organizationId,
      attemptId,
      setupIntentId: setupIntent.id,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  }

  return {
    clientSecret: setupIntent.clientSecret,
    connectedAccount: account.providerAccountReference,
    setupIntentId: setupIntent.id,
  };
}

/**
 * Termina de guardar un método después del formulario de Stripe (o de la
 * vuelta del banco). Comprueba en Stripe la preparación guardada en el
 * intento de esta persona pagadora y, si salió bien, activa la autorización
 * (revocando la anterior en la misma transacción).
 */
export async function completeFamilyPaymentSetup(
  input: { userId: string; organizationId: string; familyId: string; setupIntentId: string; now?: Date },
  deps?: FamilyPaymentMethodsDeps
): Promise<{ outcome: "active"; method: PaymentMethodKind } | { outcome: "pending" }> {
  const parsed = completeInputSchema.parse(input);
  const now = input.now ?? new Date();
  const organizationId = parsed.organizationId;
  const context = await requireWritableContext(parsed, now);
  const { payer, account } = context;

  const attemptKey = {
    organizationId,
    familyId: parsed.familyId,
    familyPayerId: payer.familyPayerId,
    setupReference: parsed.setupIntentId,
  };
  const attempt = await findSetupAttemptForPayer(db, attemptKey);
  if (!attempt || attempt.paymentProviderAccountId !== account.id) throw notFoundError();
  if (attempt.status === "completed") {
    return { outcome: "active", method: attempt.paymentMethodKind };
  }
  if (attempt.status !== "open") throw setupFailedError();
  if (!context.kinds.includes(attempt.paymentMethodKind)) throw notOfferedError();

  const gateway = gatewayFrom(deps);
  const snapshot = await gateway.retrieveSetupIntent({
    connectedAccount: account.providerAccountReference,
    setupIntentId: attempt.providerSetupReference,
  });
  const verification =
    snapshot.id === attempt.providerSetupReference
      ? verifyCompletedSetupIntent(
          {
            attemptId: attempt.id,
            customerReference: attempt.providerCustomerReference,
            kind: attempt.paymentMethodKind,
          },
          snapshot
        )
      : ({ outcome: "mismatch" } as const);

  if (verification.outcome === "mismatch") throw notFoundError();
  if (verification.outcome === "pending") return { outcome: "pending" };
  if (verification.outcome === "failed") {
    await markSetupAttemptAbandoned(db, { organizationId, attemptId: attempt.id, now });
    throw setupFailedError();
  }
  const { paymentMethodReference, mandateReference } = verification;

  let result: { method: PaymentMethodKind; previous: StoredAuthorization | null };
  try {
    result = await db.transaction(async (tx) => {
      const locked = await lockSetupAttempt(tx, { organizationId, attemptId: attempt.id });
      if (!locked) throw notFoundError();
      // Otra petición lo completó mientras se esperaba el cerrojo.
      if (locked.status === "completed") return { method: locked.paymentMethodKind, previous: null };
      if (locked.status !== "open") throw setupFailedError();

      const previous = await lockActiveAuthorization(tx, {
        organizationId,
        accountRowId: locked.paymentProviderAccountId,
        familyPayerId: locked.familyPayerId,
      });
      if (previous) {
        await revokeLockedAuthorization(tx, previous, {
          actor: "family",
          actorUserId: parsed.userId,
          reason: "replaced",
          now,
        });
      }

      const authorization = await insertActiveAuthorization(tx, {
        organizationId,
        familyId: locked.familyId,
        familyPayerId: locked.familyPayerId,
        accountRowId: locked.paymentProviderAccountId,
        setupReference: locked.providerSetupReference,
        paymentMethodReference,
        mandateReference,
        kind: locked.paymentMethodKind,
        consentVersion: locked.consentVersion,
        consentEvidenceReference: `family_payment_setup_attempts:${locked.id}`,
        consentEvidenceSha256: locked.consentTextSha256,
        consentedAt: locked.consentedAt,
        consentedByGuardianId: locked.guardianId,
        now,
      });
      await markSetupAttemptCompleted(tx, {
        organizationId,
        attemptId: locked.id,
        authorizationId: authorization.id,
        now,
      });

      const details = {
        authorizationId: authorization.id,
        attemptId: locked.id,
        familyId: locked.familyId,
        familyPayerId: locked.familyPayerId,
        paymentProviderAccountId: locked.paymentProviderAccountId,
        kind: locked.paymentMethodKind,
        consentVersion: locked.consentVersion,
        replacedAuthorizationId: previous?.id ?? null,
      };
      const idempotencyKey = `family-payment-methods:authorization-activated:${authorization.id}`;
      await appendAuditEntry(tx, {
        organizationId,
        locationId: null,
        actorUserId: parsed.userId,
        action: "family_payment_methods.authorization_activated",
        targetType: AUDIT_TARGET_TYPE,
        targetId: authorization.id,
        idempotencyKey,
        before: null,
        after: { status: "active", kind: locked.paymentMethodKind },
        metadata: details,
      });
      await appendOutboxEvent(tx, {
        organizationId,
        locationId: null,
        eventName: "family_payment_methods.authorization_activated",
        aggregateType: AUDIT_TARGET_TYPE,
        aggregateId: authorization.id,
        idempotencyKey,
        payload: details,
        occurredAt: now,
      });
      return { method: locked.paymentMethodKind, previous };
    });
  } catch (error) {
    // El índice único de una sola activa por (cuenta, pagador) es el último
    // guarda: si otra petición ganó, se devuelve lo suyo o se pide reintentar.
    if (isUniqueViolation(error) || isRetryableDbConflict(error)) {
      const current = await findSetupAttemptForPayer(db, attemptKey);
      if (current?.status === "completed") {
        return { outcome: "active", method: current.paymentMethodKind };
      }
      throw retryableDbConflictError("Ya se está guardando otro método de pago. Vuelve a intentarlo.");
    }
    throw error;
  }

  if (result.previous && result.previous.paymentMethodReference !== paymentMethodReference) {
    await detachAfterRevocation(gateway, {
      connectedAccount: account.providerAccountReference,
      authorization: result.previous,
    });
  }
  return { outcome: "active", method: result.method };
}

/**
 * Revocar no exige que la academia siga lista ni el plan de pago: dejar de
 * pagar automáticamente debe poder hacerse siempre que la función exista.
 */
async function requireRevocationAccount(organizationId: string, now: Date): Promise<StoredConnectAccount | null> {
  const gate = await loadGate(organizationId, now);
  if (!gate.open) throw unavailableError(gate.reason);
  return findConnectAccountForOrganization(db, organizationId, ENVIRONMENT);
}

/** La persona pagadora deja de pagar automáticamente. */
export async function revokeFamilyPaymentMethod(
  input: { userId: string; organizationId: string; familyId: string; now?: Date },
  deps?: FamilyPaymentMethodsDeps
): Promise<{ outcome: "revoked" | "none" }> {
  const parsed = familyInputSchema.parse(input);
  const now = input.now ?? new Date();
  const gate = await loadGate(parsed.organizationId, now);
  if (!gate.open) throw unavailableError(gate.reason);
  const payer = await resolveFamilyPayer(db, { ...parsed, now });
  if (!payer) throw notFoundError();
  const account = await findConnectAccountForOrganization(db, parsed.organizationId, ENVIRONMENT);
  if (!account) return { outcome: "none" };

  const revoked = await db.transaction(async (tx) => {
    const active = await lockActiveAuthorization(tx, {
      organizationId: parsed.organizationId,
      accountRowId: account.id,
      familyPayerId: payer.familyPayerId,
    });
    if (!active) return null;
    await revokeLockedAuthorization(tx, active, {
      actor: "family",
      actorUserId: parsed.userId,
      reason: "requested",
      now,
    });
    return active;
  });
  if (!revoked) return { outcome: "none" };

  await detachAfterRevocation(gatewayFrom(deps), {
    connectedAccount: account.providerAccountReference,
    authorization: revoked,
  });
  return { outcome: "revoked" };
}

/** Propiedad, o administración con acceso a todas las sedes (como la Fase 1). */
async function requireOwnerOrFullAdmin(userId: string, organizationId: string): Promise<void> {
  const scope = await resolveOwnerScope({ userId, organizationId });
  const allowed =
    scope.member.role === "owner" ||
    (scope.member.role === "admin" && scope.member.locationScopeMode === "all");
  if (!allowed) {
    throw new OperationalError(
      "FORBIDDEN",
      "Solo la propiedad o la administración de todas las sedes puede gestionar los pagos automáticos.",
      403
    );
  }
}

/** Nombre y primer apellido de la persona pagadora. */
function payerDisplayName(givenName: string, familyName: string): string {
  const firstSurname = familyName.trim().split(/\s+/)[0] ?? "";
  return `${givenName.trim()} ${firstSurname}`.trim();
}

/** Familias de la academia que pagan automáticamente (panel de la academia). */
export async function listOwnerFamilyPaymentMethods(input: {
  userId: string;
  organizationId: string;
}): Promise<
  Array<{ authorizationId: string; familyId: string; payerName: string; method: PaymentMethodKind; since: string }>
> {
  const parsed = ownerInputSchema.parse(input);
  await requireOwnerOrFullAdmin(parsed.userId, parsed.organizationId);
  const gate = await loadGate(parsed.organizationId, new Date());
  if (!gate.open) return [];
  const account = await findConnectAccountForOrganization(db, parsed.organizationId, ENVIRONMENT);
  if (!account) return [];

  const rows = await listActiveAuthorizationsForOrganization(db, {
    organizationId: parsed.organizationId,
    accountRowId: account.id,
    limit: OWNER_LIST_LIMIT,
  });
  return rows.map((row) => ({
    authorizationId: row.authorizationId,
    familyId: row.familyId,
    payerName: payerDisplayName(row.givenName, row.familyName),
    method: row.method,
    since: row.since.toISOString(),
  }));
}

/** La academia deja sin efecto el pago automático de una familia. */
export async function revokeFamilyPaymentMethodByOwner(
  input: { userId: string; organizationId: string; authorizationId: string; now?: Date },
  deps?: FamilyPaymentMethodsDeps
): Promise<{ outcome: "revoked" | "none" }> {
  const parsed = ownerRevokeInputSchema.parse(input);
  const now = input.now ?? new Date();
  await requireOwnerOrFullAdmin(parsed.userId, parsed.organizationId);
  const account = await requireRevocationAccount(parsed.organizationId, now);
  if (!account) return { outcome: "none" };

  const revoked = await db.transaction(async (tx) => {
    const active = await lockActiveAuthorizationById(tx, {
      organizationId: parsed.organizationId,
      accountRowId: account.id,
      authorizationId: parsed.authorizationId,
    });
    if (!active) return null;
    await revokeLockedAuthorization(tx, active, {
      actor: "owner",
      actorUserId: parsed.userId,
      reason: "requested",
      now,
    });
    return active;
  });
  if (!revoked) return { outcome: "none" };

  await detachAfterRevocation(gatewayFrom(deps), {
    connectedAccount: account.providerAccountReference,
    authorization: revoked,
  });
  return { outcome: "revoked" };
}

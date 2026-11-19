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
 *
 * Fase 4 (Tarea 8): los avisos de Stripe sobre el método (desligado, orden de
 * domiciliación inactiva, preparación terminada con el navegador cerrado)
 * llegan por revokeAuthorizationFromProvider y
 * completeFamilyPaymentSetupFromProvider. El aviso es solo un aviso: se relee
 * en Stripe por id, en la cuenta conectada de esa academia, y solo se
 * revoca si Stripe confirma que el método ya no sirve. Revocar nunca toca
 * los intentos de cobro: uno en curso sigue su camino con lo que diga Stripe;
 * el siguiente ya no sale porque la autorización deja de estar activa.
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
  evaluateFamilyPaymentRevocationAvailability,
  type FamilyPaymentRevocationUnavailableReason,
  type FamilyPaymentUnavailableReason,
} from "@/modules/family-payment-methods/domain/availability";
import {
  consentTextSha256,
  FAMILY_PAYMENT_CONSENT_VERSION,
  renderConsentText,
  type PaymentMethodKind,
} from "@/modules/family-payment-methods/domain/consent";
import { truncateClientIp, truncateUserAgent } from "@/modules/family-payment-methods/domain/evidence";
import {
  verifyCompletedSetupIntent,
  type SetupIntentSnapshot,
} from "@/modules/family-payment-methods/domain/setup-verification";
import {
  findActiveAuthorization,
  findActiveAuthorizationByMandate,
  findActiveAuthorizationByPaymentMethod,
  findLatestCustomerReference,
  findSetupAttemptByReference,
  findSetupAttemptForPayer,
  insertActiveAuthorization,
  insertSetupAttempt,
  isCurrentFamilyPayer,
  listActiveAuthorizationsForOrganization,
  loadOrganizationName,
  lockActiveAuthorization,
  lockActiveAuthorizationById,
  lockOrganizationForPaymentMethods,
  lockSetupAttempt,
  markSetupAttemptAbandoned,
  markSetupAttemptCompleted,
  resolveFamilyPayer,
  revokeAuthorization,
  type FamilyPayer,
  type StoredAuthorization,
  type StoredSetupAttempt,
} from "@/modules/family-payment-methods/infrastructure/family-payment-store";
import {
  createStripeFamilyGateway,
  familyCustomerIdempotencyKey,
  familyProviderReadFailureOf,
  type FamilyPaymentGateway,
  type FamilyPaymentMethodReads,
} from "@/modules/family-payment-methods/infrastructure/stripe-family-gateway";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";
import {
  findConnectAccountForOrganization,
  type StoredConnectAccount,
} from "@/modules/payments-connect/infrastructure/connect-account-store";
import { FAMILY_COLLECTION_JOB_KEY } from "@/modules/shared/application/actor";
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

/** Fase 4 (Tarea 8): relecturas del método y de la orden en Stripe. */
export interface FamilyPaymentProviderReadDeps {
  gateway?: FamilyPaymentMethodReads;
}

/** Por qué Stripe dejó sin efecto el método (Fase 4, Tarea 8). */
export type ProviderRevocationReason = "detached_in_stripe" | "mandate_inactive";

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
  // Se comprueban a mano, antes de validar el resto, para responder 400 con
  // un código propio también cuando faltan.
  consentVersion: z.unknown().optional(),
  consentAccepted: z.unknown().optional(),
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

const PAYMENT_METHOD_REFERENCE = /^pm_[A-Za-z0-9]{1,250}$/;
const MANDATE_REFERENCE = /^mandate_[A-Za-z0-9]{1,250}$/;

/** Exactamente uno: el método (desligado) o la orden (inactiva), con su motivo. */
const providerRevokeInputSchema = z.union([
  z.object({
    organizationId: z.guid(),
    accountRowId: z.guid(),
    paymentMethodId: z.string().regex(PAYMENT_METHOD_REFERENCE),
    mandateId: z.undefined().optional(),
    reason: z.literal("detached_in_stripe"),
  }),
  z.object({
    organizationId: z.guid(),
    accountRowId: z.guid(),
    paymentMethodId: z.undefined().optional(),
    mandateId: z.string().regex(MANDATE_REFERENCE),
    reason: z.literal("mandate_inactive"),
  }),
]);

const providerSetupInputSchema = z.object({
  organizationId: z.guid(),
  accountRowId: z.guid(),
  setupIntentId: z.string().max(255).regex(/^seti_[A-Za-z0-9]+$/),
});

/** Marca de auditoría de lo que hace el sistema (como el proceso diario del cobro). */
const SYSTEM_AUDIT_METADATA = { actor_type: "system", job_key: FAMILY_COLLECTION_JOB_KEY } as const;

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

/** La tabla de intentos (Fase 2) y las columnas de la cuenta conectada (Fase 1). */
async function loadStorageAvailable(): Promise<boolean> {
  const [family, connect] = await Promise.all([
    isFamilyPaymentMethodsStorageAvailable(),
    isConnectOnboardingStorageAvailable(),
  ]);
  return family && connect;
}

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
    storageAvailable = await loadStorageAvailable();
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

type RevocationGate = { open: true } | { open: false; reason: FamilyPaymentRevocationUnavailableReason };

/**
 * Puerta para revocar (y para ver un método ya guardado): no mira la bandera
 * de esta fase, sí la clave de test, la base que no es de producción y el
 * almacenamiento. Fuera de `test` o contra producción no se consulta la base.
 */
async function loadRevocationGate(): Promise<RevocationGate> {
  const environment = resolveConnectEnvironment();
  const productionDatabase = isProductionDatabase();
  const storageAvailable =
    environment === ENVIRONMENT && !productionDatabase ? await loadStorageAvailable() : false;
  const result = evaluateFamilyPaymentRevocationAvailability({ environment, productionDatabase, storageAvailable });
  return result.available ? { open: true } : { open: false, reason: result.reason };
}

/** Lo que el resto de comprobaciones necesita cuando la puerta de revocar está abierta y la bandera encendida. */
const OPEN_GATE_INPUTS: GateInputs = {
  flagEnabled: true,
  environment: ENVIRONMENT,
  productionDatabase: false,
  storageAvailable: true,
};

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

/**
 * Quién hace el cambio: una persona (familia o academia) o el sistema (un
 * aviso de Stripe, Fase 4). El sistema no tiene usuario: la auditoría lo
 * marca con el trabajo del cobro automático.
 */
type ChangeActor = { actor: "family" | "owner"; actorUserId: string } | { actor: "system" };

function actorUserIdOf(actor: ChangeActor): string | null {
  return actor.actor === "system" ? null : actor.actorUserId;
}

/** Marca `revoked` una autorización ya bloqueada y deja auditoría y evento. */
async function revokeLockedAuthorization(
  tx: TransactionClient,
  authorization: StoredAuthorization,
  input: ChangeActor & { reason: "requested" | "replaced" | ProviderRevocationReason; now: Date }
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
    actorUserId: actorUserIdOf(input),
    action: "family_payment_methods.authorization_revoked",
    targetType: AUDIT_TARGET_TYPE,
    targetId: authorization.id,
    idempotencyKey,
    before: { status: "active" },
    after: { status: "revoked" },
    metadata: input.actor === "system" ? { ...details, ...SYSTEM_AUDIT_METADATA } : details,
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

/**
 * Con la bandera apagada solo se enseña un método ya guardado, para que la
 * persona pagadora pueda dejar de pagar automáticamente; nunca se ofrece
 * guardar ni cambiar (`kinds` vacío). Cualquier otra cosa es `flag_off`.
 */
async function getActiveStateWithFlagOff(
  input: { userId: string; organizationId: string; familyId: string },
  now: Date
): Promise<FamilyPaymentMethodState> {
  const off: FamilyPaymentMethodState = { kind: "unavailable", reason: "flag_off" };
  const gate = await loadRevocationGate();
  if (!gate.open) return off;
  const payer = await resolveFamilyPayer(db, { ...input, now });
  if (!payer) return off;
  const account = await findConnectAccountForOrganization(db, input.organizationId, ENVIRONMENT);
  if (!account) return off;
  const active = await findActiveAuthorization(db, {
    organizationId: input.organizationId,
    accountRowId: account.id,
    familyPayerId: payer.familyPayerId,
  });
  if (!active) return off;
  const academyName = await loadOrganizationName(db, input.organizationId);
  if (academyName === null) throw new Error("Family payment methods: academy row missing");
  return {
    kind: "active",
    method: active.paymentMethodKind,
    since: active.consentedAt.toISOString(),
    kinds: [],
    academyName,
    consentVersion: FAMILY_PAYMENT_CONSENT_VERSION,
    consentTexts: {},
  };
}

/** Estado del pago automático de una familia para el portal. */
export async function getFamilyPaymentMethodState(
  input: { userId: string; organizationId: string; familyId: string; now?: Date },
  // Sin Stripe: se acepta por simetría con el resto de funciones.
  _deps?: FamilyPaymentMethodsDeps
): Promise<FamilyPaymentMethodState> {
  const parsed = familyInputSchema.parse(input);
  const now = input.now ?? new Date();
  if (!isFamilyPaymentMethodsFlagEnabled()) return getActiveStateWithFlagOff(parsed, now);
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
  // El consentimiento se mira antes que la forma del resto: si falta o no es
  // el texto vigente, 400 con código propio sin tocar la base ni Stripe.
  const consent = input as { consentAccepted?: unknown; consentVersion?: unknown };
  if (consent.consentAccepted !== true || consent.consentVersion !== FAMILY_PAYMENT_CONSENT_VERSION) {
    throw new OperationalError(
      "FAMILY_PAYMENT_CONSENT_REQUIRED",
      "Lee y acepta el texto del pago automático para continuar.",
      400
    );
  }
  const parsed = startInputSchema.parse(input);
  const now = input.now ?? new Date();

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

/** Resultado de activar un intento ya comprobado en Stripe. */
type SetupActivation =
  | { kind: "activated"; method: PaymentMethodKind; authorizationId: string }
  /** Otra petición (o el aviso de Stripe) lo completó mientras se esperaba el cerrojo. */
  | { kind: "already_completed"; method: PaymentMethodKind }
  | { kind: "missing" }
  /** El intento ya no está abierto (abandonado). */
  | { kind: "not_open" }
  /** El índice único de una sola activa por (cuenta, pagador) o un conflicto de la base. */
  | { kind: "conflict" };

/**
 * La activación común (Fase 2 y Fase 4, decisión 12 del ADR): en una
 * transacción corta bloquea la academia (primer cerrojo del orden único,
 * como el cobro) y el intento, revoca la autorización activa
 * anterior de esa persona pagadora en esa cuenta, inserta la nueva y marca el
 * intento completado, con auditoría y evento. Después del commit desliga en
 * Stripe el método anterior si era otro. Nunca llama a Stripe dentro de la
 * transacción.
 */
async function activateVerifiedSetup(input: {
  organizationId: string;
  attemptId: string;
  paymentMethodReference: string;
  mandateReference: string | null;
  actor: { actor: "family"; actorUserId: string } | { actor: "system" };
  connectedAccount: string;
  gateway: FamilyPaymentGateway;
  now: Date;
}): Promise<SetupActivation> {
  const { organizationId, paymentMethodReference, mandateReference, actor, now } = input;
  let result:
    | { kind: "activated"; method: PaymentMethodKind; authorizationId: string; previous: StoredAuthorization | null }
    | Exclude<SetupActivation, { kind: "activated" }>;
  try {
    result = await db.transaction(async (tx) => {
      // Orden único: academia → intento de preparación → autorización.
      if (!(await lockOrganizationForPaymentMethods(tx, organizationId))) return { kind: "missing" } as const;
      const locked = await lockSetupAttempt(tx, { organizationId, attemptId: input.attemptId });
      if (!locked) return { kind: "missing" } as const;
      // Otra petición lo completó mientras se esperaba el cerrojo.
      if (locked.status === "completed") return { kind: "already_completed", method: locked.paymentMethodKind } as const;
      if (locked.status !== "open") return { kind: "not_open" } as const;

      const previous = await lockActiveAuthorization(tx, {
        organizationId,
        accountRowId: locked.paymentProviderAccountId,
        familyPayerId: locked.familyPayerId,
      });
      if (previous) {
        await revokeLockedAuthorization(tx, previous, { ...actor, reason: "replaced", now });
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
        // Lo de la familia queda igual que en la Fase 2; el sistema se nombra.
        ...(actor.actor === "system" ? { actor: "system" } : {}),
      };
      const idempotencyKey = `family-payment-methods:authorization-activated:${authorization.id}`;
      await appendAuditEntry(tx, {
        organizationId,
        locationId: null,
        actorUserId: actorUserIdOf(actor),
        action: "family_payment_methods.authorization_activated",
        targetType: AUDIT_TARGET_TYPE,
        targetId: authorization.id,
        idempotencyKey,
        before: null,
        after: { status: "active", kind: locked.paymentMethodKind },
        metadata: actor.actor === "system" ? { ...details, ...SYSTEM_AUDIT_METADATA } : details,
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
      return {
        kind: "activated",
        method: locked.paymentMethodKind,
        authorizationId: authorization.id,
        previous,
      } as const;
    });
  } catch (error) {
    // El índice único de una sola activa por (cuenta, pagador) es el último
    // guarda: quien llama decide si otra petición ganó o se pide reintentar.
    if (isUniqueViolation(error) || isRetryableDbConflict(error)) return { kind: "conflict" };
    throw error;
  }

  if (result.kind !== "activated") return result;
  if (result.previous && result.previous.paymentMethodReference !== paymentMethodReference) {
    await detachAfterRevocation(input.gateway, {
      connectedAccount: input.connectedAccount,
      authorization: result.previous,
    });
  }
  return { kind: "activated", method: result.method, authorizationId: result.authorizationId };
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
  const verification = verifySetupOfAttempt(attempt, snapshot);

  if (verification.outcome === "mismatch") throw notFoundError();
  if (verification.outcome === "pending") return { outcome: "pending" };
  if (verification.outcome === "failed") {
    await markSetupAttemptAbandoned(db, { organizationId, attemptId: attempt.id, now });
    throw setupFailedError();
  }

  const activation = await activateVerifiedSetup({
    organizationId,
    attemptId: attempt.id,
    paymentMethodReference: verification.paymentMethodReference,
    mandateReference: verification.mandateReference,
    actor: { actor: "family", actorUserId: parsed.userId },
    connectedAccount: account.providerAccountReference,
    gateway,
    now,
  });
  switch (activation.kind) {
    case "activated":
    case "already_completed":
      return { outcome: "active", method: activation.method };
    case "missing":
      throw notFoundError();
    case "not_open":
      throw setupFailedError();
    case "conflict": {
      const current = await findSetupAttemptForPayer(db, attemptKey);
      if (current?.status === "completed") {
        return { outcome: "active", method: current.paymentMethodKind };
      }
      throw retryableDbConflictError("Ya se está guardando otro método de pago. Vuelve a intentarlo.");
    }
  }
}

/** Lo que dice Stripe de la preparación, comparado con el intento guardado. */
function verifySetupOfAttempt(attempt: StoredSetupAttempt, snapshot: SetupIntentSnapshot) {
  return snapshot.id === attempt.providerSetupReference
    ? verifyCompletedSetupIntent(
        {
          attemptId: attempt.id,
          customerReference: attempt.providerCustomerReference,
          kind: attempt.paymentMethodKind,
        },
        snapshot
      )
    : ({ outcome: "mismatch" } as const);
}

// ---------------------------------------------------------------------------
// Fase 4 (Tarea 8): avisos de Stripe sobre el método de pago
// ---------------------------------------------------------------------------

/**
 * Lee en Stripe con `read`. Un error que no se arregla reintentando (el
 * objeto no existe, sin permiso sobre la cuenta, cuenta no válida) se
 * registra solo con nombre y código y devuelve `null`: sin efecto. Uno
 * pasajero se lanza para que el evento quede `failed` y Stripe lo reenvíe.
 */
async function readFromProvider<T>(
  read: () => Promise<T>,
  ids: Record<string, string>
): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    const failure = familyProviderReadFailureOf(error);
    if (!failure.permanent) throw error;
    logger.warn("Pago automático: Stripe no deja leer el método de un aviso; sin efecto", {
      ...ids,
      errorName: failure.errorName,
      errorCode: failure.errorCode,
    });
    return { ok: false };
  }
}

/**
 * La cuenta conectada `test` de la academia, solo si es la del aviso: un
 * aviso de otra cuenta (u otra academia) nunca toca nada.
 */
async function findEventAccount(organizationId: string, accountRowId: string): Promise<StoredConnectAccount | null> {
  const account = await findConnectAccountForOrganization(db, organizationId, ENVIRONMENT);
  if (!account || account.id !== accountRowId || account.environment !== ENVIRONMENT) {
    logger.warn("Pago automático: aviso de Stripe de una cuenta que no es la de la academia; sin efecto", {
      organizationId,
      accountRowId,
    });
    return null;
  }
  return account;
}

/**
 * Stripe avisa de que el método ya no sirve (`payment_method.detached`) o de
 * que la orden de domiciliación ya no vale (`mandate.updated`). Se relee en
 * Stripe, en la cuenta conectada de la academia: el método sin cliente
 * (`customer === null`) o que ya no existe, o la orden `inactive`. Solo
 * entonces la autorización activa de esa academia y esa cuenta con ese
 * método (o esa orden) pasa a `revoked`, sin volver a desligar en Stripe, con
 * auditoría del sistema (`zaltyko-family-collection`).
 *
 * - Como la revocación de la familia, no exige la bandera de esta fase: dejar
 *   de cobrar con un método que ya no sirve siempre se puede (clave de test,
 *   base que no es la de producción y almacenamiento presente).
 * - Idempotente y sin orden: una autorización ya revocada, un método que
 *   Stripe aún tiene ligado o una orden `active`/`pending` → `none`.
 * - Nunca toca los intentos de cobro: uno en curso sigue con lo que diga
 *   Stripe (su dinero pudo moverse). El siguiente cobro ya no sale porque
 *   solo se cobra con una autorización activa.
 * - La transacción bloquea primero la academia y después la autorización:
 *   el mismo orden que el cobro (academia → cuotas → factura → autorización
 *   `for share` → intento → pago), así que nunca se cruzan.
 */
export async function revokeAuthorizationFromProvider(
  input: {
    organizationId: string;
    accountRowId: string;
    paymentMethodId?: string;
    mandateId?: string;
    reason: ProviderRevocationReason;
    now: Date;
  },
  deps?: FamilyPaymentProviderReadDeps
): Promise<{ outcome: "revoked"; authorizationId: string } | { outcome: "none" }> {
  const parsed = providerRevokeInputSchema.parse({
    organizationId: input.organizationId,
    accountRowId: input.accountRowId,
    paymentMethodId: input.paymentMethodId,
    mandateId: input.mandateId,
    reason: input.reason,
  });
  const none = { outcome: "none" } as const;
  const gate = await loadRevocationGate();
  if (!gate.open) return none;
  const account = await findEventAccount(parsed.organizationId, parsed.accountRowId);
  if (!account) return none;

  const scope = { organizationId: parsed.organizationId, accountRowId: account.id };
  const found =
    parsed.reason === "detached_in_stripe"
      ? await findActiveAuthorizationByPaymentMethod(db, { ...scope, paymentMethodReference: parsed.paymentMethodId })
      : await findActiveAuthorizationByMandate(db, { ...scope, mandateReference: parsed.mandateId });
  // Ninguna activa con ese método u orden (otra cosa de la academia, o ya revocada): ni se lee Stripe.
  if (!found) return none;

  const gateway = deps?.gateway ?? createStripeFamilyGateway();
  const ids = {
    organizationId: parsed.organizationId,
    authorizationId: found.id,
    accountId: account.providerAccountReference,
  };
  const connectedAccount = account.providerAccountReference;
  let gone: boolean;
  if (parsed.reason === "detached_in_stripe") {
    const paymentMethodId = parsed.paymentMethodId;
    const read = await readFromProvider(
      () => gateway.retrievePaymentMethod({ connectedAccount, paymentMethodId }),
      { ...ids, paymentMethodId }
    );
    if (!read.ok) return none;
    // Ya no existe, o existe sin cliente: no se puede volver a cobrar con él.
    gone = read.value === null || (read.value.id === paymentMethodId && read.value.customer === null);
  } else {
    const mandateId = parsed.mandateId;
    const read = await readFromProvider(
      () => gateway.retrieveMandate({ connectedAccount, mandateId }),
      { ...ids, mandateId }
    );
    if (!read.ok) return none;
    // Solo `inactive` dice que la orden ya no vale; una que no aparece no se da por perdida.
    gone = read.value !== null && read.value.id === mandateId && read.value.status === "inactive";
  }
  if (!gone) return none;

  const revoked = await db.transaction(async (tx) => {
    // Orden único: academia → autorización (el cobro la lee después de academia, cuotas y factura).
    if (!(await lockOrganizationForPaymentMethods(tx, scope.organizationId))) return null;
    const locked = await lockActiveAuthorizationById(tx, { ...scope, authorizationId: found.id });
    // Otro camino (la familia, la academia u otro aviso) ya la revocó o la cambió.
    if (!locked || locked.paymentMethodReference !== found.paymentMethodReference) return null;
    await revokeLockedAuthorization(tx, locked, { actor: "system", reason: parsed.reason, now: input.now });
    return locked;
  });
  if (!revoked) return none;
  logger.info("Pago automático: autorización revocada por un aviso de Stripe", { ...ids, reason: parsed.reason });
  return { outcome: "revoked", authorizationId: revoked.id };
}

/**
 * Decisión 12 del ADR: la familia guardó el método en Stripe pero cerró el
 * navegador antes de volver a Zaltyko. Con `setup_intent.succeeded` se relee
 * el `seti_…`, se busca el intento de preparación abierto con esa referencia
 * en esa academia y esa cuenta, y se activa con la misma activación que
 * completeFamilyPaymentSetup (activateVerifiedSetup), con el sistema como
 * actor.
 *
 * - Exige lo mismo que completar desde el navegador: bandera de esta fase,
 *   clave de test, base que no es la de producción, academia lista con su
 *   plan y el tipo de método aceptado. Si no, `none` (el navegador tampoco
 *   lo activaría).
 * - Una preparación ya completada (por el navegador o por otro aviso),
 *   abandonada o que no es de Zaltyko → `none`. Lo que Stripe aún no da por
 *   terminado → `pending`, sin escribir. Una que falló no se marca
 *   abandonada desde aquí: la familia puede seguir en el formulario.
 */
export async function completeFamilyPaymentSetupFromProvider(
  input: { organizationId: string; accountRowId: string; setupIntentId: string; now: Date },
  deps?: FamilyPaymentMethodsDeps
): Promise<
  { outcome: "active"; authorizationId: string; method: PaymentMethodKind } | { outcome: "pending" } | { outcome: "none" }
> {
  const parsed = providerSetupInputSchema.parse({
    organizationId: input.organizationId,
    accountRowId: input.accountRowId,
    setupIntentId: input.setupIntentId,
  });
  const now = input.now;
  const none = { outcome: "none" } as const;
  const ids = { organizationId: parsed.organizationId, setupIntentId: parsed.setupIntentId };

  const gate = await loadGate(parsed.organizationId, now);
  if (!gate.open) {
    logger.info("Pago automático: preparación terminada en Stripe con el pago automático cerrado; sin efecto", {
      ...ids,
      reason: gate.reason,
    });
    return none;
  }
  const attemptKey = {
    organizationId: parsed.organizationId,
    accountRowId: parsed.accountRowId,
    setupReference: parsed.setupIntentId,
  };
  const attempt = await findSetupAttemptByReference(db, attemptKey);
  // Una preparación que no creó Zaltyko, o ya completada o abandonada.
  if (!attempt || attempt.status !== "open") return none;
  // Tarea M (punto 11): sin la sesión de la persona, se comprueba barato que
  // quien la empezó sigue siendo la pagadora vigente; si no, sin efecto.
  const payerStillCurrent = await isCurrentFamilyPayer(db, {
    organizationId: parsed.organizationId,
    familyId: attempt.familyId,
    familyPayerId: attempt.familyPayerId,
    guardianId: attempt.guardianId,
    now,
  });
  if (!payerStillCurrent) {
    logger.info("Pago automático: preparación terminada en Stripe de quien ya no es la persona pagadora; sin efecto", {
      ...ids,
      attemptId: attempt.id,
    });
    return none;
  }

  const context = await loadAcademyContext(gate.inputs, parsed.organizationId, true, now);
  const account = context.account;
  if (
    !account ||
    account.id !== parsed.accountRowId ||
    attempt.paymentProviderAccountId !== account.id ||
    context.kinds === null ||
    !context.kinds.includes(attempt.paymentMethodKind)
  ) {
    logger.info("Pago automático: preparación terminada en Stripe que la academia no puede aceptar ahora; sin efecto", {
      ...ids,
      attemptId: attempt.id,
      reason: context.reason ?? "not_offered",
    });
    return none;
  }

  const gateway = gatewayFrom(deps);
  const connectedAccount = account.providerAccountReference;
  const setupIntentId = attempt.providerSetupReference;
  const read = await readFromProvider(
    () => gateway.retrieveSetupIntent({ connectedAccount, setupIntentId }),
    { ...ids, attemptId: attempt.id, accountId: connectedAccount }
  );
  if (!read.ok) return none;
  const verification = verifySetupOfAttempt(attempt, read.value);
  if (verification.outcome === "mismatch") {
    logger.warn("Pago automático: la preparación de Stripe no es la del intento; sin efecto", {
      ...ids,
      attemptId: attempt.id,
    });
    return none;
  }
  if (verification.outcome === "pending") return { outcome: "pending" };
  if (verification.outcome === "failed") return none;

  const activation = await activateVerifiedSetup({
    organizationId: parsed.organizationId,
    attemptId: attempt.id,
    paymentMethodReference: verification.paymentMethodReference,
    mandateReference: verification.mandateReference,
    actor: { actor: "system" },
    connectedAccount,
    gateway,
    now,
  });
  switch (activation.kind) {
    case "activated":
      return { outcome: "active", authorizationId: activation.authorizationId, method: activation.method };
    case "already_completed":
    case "missing":
    case "not_open":
      return none;
    case "conflict": {
      // Otra petición (el navegador) lo completó a la vez: activa una sola vez.
      const current = await findSetupAttemptByReference(db, attemptKey);
      if (current?.status === "completed") return none;
      // Otra preparación de la misma persona se activa a la vez: Stripe reenvía el aviso.
      throw retryableDbConflictError("Ya se está guardando otro método de pago. Vuelve a intentarlo.");
    }
  }
}

/**
 * Revocar no exige la bandera de esta fase, ni que la academia siga lista, ni
 * el plan de pago: dejar de pagar automáticamente debe poder hacerse siempre
 * que exista el almacenamiento, con clave de test y fuera de producción.
 */
async function requireRevocationAccount(organizationId: string): Promise<StoredConnectAccount | null> {
  const gate = await loadRevocationGate();
  if (!gate.open) throw unavailableError(gate.reason);
  return findConnectAccountForOrganization(db, organizationId, ENVIRONMENT);
}

/** La persona pagadora deja de pagar automáticamente (también con la bandera apagada). */
export async function revokeFamilyPaymentMethod(
  input: { userId: string; organizationId: string; familyId: string; now?: Date },
  deps?: FamilyPaymentMethodsDeps
): Promise<{ outcome: "revoked" | "none" }> {
  const parsed = familyInputSchema.parse(input);
  const now = input.now ?? new Date();
  const gate = await loadRevocationGate();
  if (!gate.open) throw unavailableError(gate.reason);
  const payer = await resolveFamilyPayer(db, { ...parsed, now });
  if (!payer) throw notFoundError();
  const account = await findConnectAccountForOrganization(db, parsed.organizationId, ENVIRONMENT);
  if (!account) return { outcome: "none" };

  const revoked = await db.transaction(async (tx) => {
    // Tarea M (punto 10): orden único, academia primero (como el cobro y la
    // activación), para no interbloquear con ellos.
    if (!(await lockOrganizationForPaymentMethods(tx, parsed.organizationId))) return null;
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

export interface OwnerFamilyPaymentMethodRow {
  authorizationId: string;
  familyId: string;
  payerName: string;
  method: PaymentMethodKind;
  since: string;
}

/**
 * Orden: puerta de revocar (sin bandera) → rol → base. Con la puerta cerrada
 * no se consulta nada de la academia.
 */
async function readOwnerFamilyPaymentMethods(input: {
  userId: string;
  organizationId: string;
}): Promise<{ open: false } | { open: true; methods: OwnerFamilyPaymentMethodRow[] }> {
  const gate = await loadRevocationGate();
  if (!gate.open) return { open: false };
  await requireOwnerOrFullAdmin(input.userId, input.organizationId);
  const account = await findConnectAccountForOrganization(db, input.organizationId, ENVIRONMENT);
  if (!account) return { open: true, methods: [] };

  const rows = await listActiveAuthorizationsForOrganization(db, {
    organizationId: input.organizationId,
    accountRowId: account.id,
    limit: OWNER_LIST_LIMIT,
  });
  return {
    open: true,
    methods: rows.map((row) => ({
      authorizationId: row.authorizationId,
      familyId: row.familyId,
      payerName: payerDisplayName(row.givenName, row.familyName),
      method: row.method,
      since: row.since.toISOString(),
    })),
  };
}

/**
 * Familias de la academia que pagan automáticamente. También con la bandera
 * apagada, para que la academia pueda revocar lo que ya está guardado.
 */
export async function listOwnerFamilyPaymentMethods(input: {
  userId: string;
  organizationId: string;
}): Promise<OwnerFamilyPaymentMethodRow[]> {
  const parsed = ownerInputSchema.parse(input);
  const read = await readOwnerFamilyPaymentMethods(parsed);
  return read.open ? read.methods : [];
}

export type OwnerFamilyPaymentMethodsView =
  | { visible: false }
  | { visible: true; methods: OwnerFamilyPaymentMethodRow[] };

/**
 * Panel de la academia en Familias. Con autorizaciones activas se enseña
 * siempre (para poder revocarlas). Vacío solo se enseña si la academia puede
 * ofrecer el pago automático ahora (bandera encendida, cuenta lista y plan de
 * pago); si no, un «ninguna familia todavía» sería engañoso y no se pinta.
 */
export async function getOwnerFamilyPaymentMethodsView(input: {
  userId: string;
  organizationId: string;
  now?: Date;
}): Promise<OwnerFamilyPaymentMethodsView> {
  const parsed = ownerInputSchema.parse(input);
  const now = input.now ?? new Date();
  const read = await readOwnerFamilyPaymentMethods(parsed);
  if (!read.open) return { visible: false };
  if (read.methods.length > 0) return { visible: true, methods: read.methods };
  if (!isFamilyPaymentMethodsFlagEnabled()) return { visible: false };
  // La puerta de revocar ya comprobó entorno, base y almacenamiento.
  const context = await loadAcademyContext(OPEN_GATE_INPUTS, parsed.organizationId, true, now);
  return context.kinds === null ? { visible: false } : { visible: true, methods: [] };
}

/** La academia deja sin efecto el pago automático de una familia. */
export async function revokeFamilyPaymentMethodByOwner(
  input: { userId: string; organizationId: string; authorizationId: string; now?: Date },
  deps?: FamilyPaymentMethodsDeps
): Promise<{ outcome: "revoked" | "none" }> {
  const parsed = ownerRevokeInputSchema.parse(input);
  const now = input.now ?? new Date();
  await requireOwnerOrFullAdmin(parsed.userId, parsed.organizationId);
  const account = await requireRevocationAccount(parsed.organizationId);
  if (!account) return { outcome: "none" };

  const revoked = await db.transaction(async (tx) => {
    // Tarea M (punto 10b): academia primero, como la activación desde el
    // navegador (academia → autorización) y el cobro.
    if (!(await lockOrganizationForPaymentMethods(tx, parsed.organizationId))) return null;
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

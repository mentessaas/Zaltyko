/**
 * Conectar Stripe (cobro automático de cuotas, Fase 1): servicio de
 * aplicación.
 *
 * La academia conecta su propia cuenta Stripe (Accounts v2, cargos directos)
 * y Zaltyko guarda solo una proyección de su estado en
 * zaltyko.organization_payment_provider_accounts. En esta fase no hay cobros.
 *
 * Reglas que no se rompen aquí:
 * - Ninguna llamada a Stripe dentro de `db.transaction`: primero se lee o crea
 *   en Stripe y después se escribe en una transacción corta.
 * - La tabla solo se toca después de comprobar el almacenamiento (dos columnas
 *   vienen de un candidato sin aplicar) y siempre con columnas explícitas.
 * - En los logs solo van ids (`acct_…`, academia); nunca el cuerpo de la
 *   cuenta ni correos.
 */
import { z } from "zod";

import { db } from "@/db";
import { getAppUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { loadOrganizationPlanState } from "@/modules/billing/application/plan-state";
import { resolveOwnerScope, type OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import {
  isConnectOnboardingFlagEnabled,
  resolveConnectEnvironment,
} from "@/modules/payments-connect/application/config";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";
import {
  projectConnectAccount,
  projectionChanged,
  type ConnectAccountProjection,
  type ConnectAccountSnapshot,
} from "@/modules/payments-connect/domain/account-projection";
import {
  evaluateConnectAvailability,
  type ConnectAvailability,
  type ConnectUnavailableReason,
} from "@/modules/payments-connect/domain/availability";
import {
  findConnectAccountByReference,
  findConnectAccountForOrganization,
  insertConnectAccountIfAbsent,
  loadOrganizationCountryCode,
  lockConnectAccount,
  storedProjection,
  touchConnectAccountSyncedAt,
  updateConnectAccountProjection,
  type StoredConnectAccount,
} from "@/modules/payments-connect/infrastructure/connect-account-store";
import {
  createStripeConnectGateway,
  isStripeIdempotencyConflict,
  type ConnectAccountsGateway,
} from "@/modules/payments-connect/infrastructure/stripe-connect-gateway";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import {
  appendAuditEntry,
  appendOutboxEvent,
} from "@/modules/shared/infrastructure/transactional-records";

export type ConnectScreenState =
  | { kind: "unavailable"; reason: ConnectUnavailableReason }
  | { kind: "not_connected" }
  | {
      kind: "needs_details" | "in_review" | "ready" | "problem";
      card: string;
      sepa: string;
      disabled: boolean;
    };

export interface ConnectServiceDeps {
  gateway?: ConnectAccountsGateway;
  now?: Date;
}

/** Vuelta desde Stripe: + `?organizationId=…&stripe=vuelta#cobro-automatico`. */
export const CONNECT_RETURN_PATH = "/owner/settings";
/** Enlace caducado (refresh_url): + `?organizationId=…`; pide un enlace nuevo. */
export const CONNECT_LINK_ROUTE = "/api/v1/owner/payments/connect/link";

/** Un refresco a petición solo vuelve a leer Stripe pasado este margen. */
const REFRESH_AFTER_MS = 60_000;

/**
 * Motivos que ocultan la pantalla aunque la academia ya tenga cuenta. País y
 * plan no: una cuenta ya creada sigue mostrando su estado (R3).
 */
const BLOCKING_REASONS_WITH_ACCOUNT: ReadonlySet<ConnectUnavailableReason> = new Set([
  "flag_off",
  "environment_unknown",
  "live_not_released",
  "storage_missing",
  "role_not_allowed",
]);

const AUDIT_TARGET_TYPE = "organization_payment_provider_account";

const ownerInputSchema = z.object({
  userId: z.guid(),
  organizationId: z.guid(),
});

const statusInputSchema = ownerInputSchema.extend({
  refresh: z.boolean(),
});

const eventInputSchema = z.object({
  eventId: z.string().trim().min(1).max(255),
  accountId: z.string(),
  livemode: z.boolean(),
});

const ACCOUNT_REFERENCE = /^acct_[A-Za-z0-9]+$/;

function gatewayFrom(deps: ConnectServiceDeps | undefined): ConnectAccountsGateway {
  return deps?.gateway ?? createStripeConnectGateway();
}

/**
 * Disponibilidad para esta persona y academia. Sin bandera o fuera de `test`
 * no se consulta la base: esos motivos van antes en la prioridad de
 * evaluateConnectAvailability y el resultado no depende del resto.
 */
async function loadAvailability(scope: OwnerScope, now: Date): Promise<ConnectAvailability> {
  const flagEnabled = isConnectOnboardingFlagEnabled();
  const environment = resolveConnectEnvironment();
  const member = {
    role: scope.member.role,
    locationScopeMode: scope.member.locationScopeMode,
  };
  const organizationId = scope.organization.id;
  const notLoaded = {
    storageAvailable: false,
    countryCode: "",
    planState: { entitlement: null, subscription: null },
  };

  if (!flagEnabled || environment !== "test") {
    return evaluateConnectAvailability({
      flagEnabled,
      environment,
      member,
      organizationId,
      now,
      ...notLoaded,
    });
  }

  const storageAvailable = await isConnectOnboardingStorageAvailable();
  if (!storageAvailable) {
    return evaluateConnectAvailability({
      flagEnabled,
      environment,
      member,
      organizationId,
      now,
      ...notLoaded,
    });
  }

  const [countryCode, planState] = await Promise.all([
    loadOrganizationCountryCode(db, organizationId),
    loadOrganizationPlanState(db, organizationId),
  ]);
  return evaluateConnectAvailability({
    flagEnabled,
    environment,
    storageAvailable,
    member,
    countryCode,
    planState,
    organizationId,
    now,
  });
}

function toScreenState(account: StoredConnectAccount): ConnectScreenState {
  const details = {
    card: account.cardPaymentsCapabilityStatus,
    sepa: account.sepaDebitPaymentsCapabilityStatus,
    disabled: false,
  };
  switch (account.status) {
    case "active":
      return { kind: "ready", ...details };
    case "restricted":
      return { kind: "problem", ...details };
    case "disabled":
      return { kind: "problem", ...details, disabled: true };
    case "onboarding":
      // R10: requisitos de la academia exigibles (`user_action`) o vencidos
      // (`past_due`, p. ej. una cuenta recién creada) → faltan datos.
      return account.requirementsState === "stripe_review"
        ? { kind: "in_review", ...details }
        : { kind: "needs_details", ...details };
    default:
      // `pending` no lo escribe esta fase; a efectos de pantalla falta completar datos.
      return { kind: "needs_details", ...details };
  }
}

function projectionRecord(projection: ConnectAccountProjection): Record<string, unknown> {
  return {
    status: projection.status,
    cardPaymentsCapabilityStatus: projection.cardPaymentsCapabilityStatus,
    sepaDebitPaymentsCapabilityStatus: projection.sepaDebitPaymentsCapabilityStatus,
    requirementsState: projection.requirementsState,
  };
}

/**
 * Guarda una proyección recién leída de Stripe. Transacción corta, sin Stripe
 * dentro: bloquea la fila, compara con lo guardado y, solo si cambia, sube
 * `revision` y deja auditoría y evento. Si no cambia, solo anota
 * `last_synced_at`. Devuelve `null` si la fila ya no existe.
 */
async function persistProjection(input: {
  accountRowId: string;
  projection: ConnectAccountProjection;
  actorUserId: string | null;
  providerEventReference: string | null;
  now: Date;
}): Promise<{ outcome: "synced" | "unchanged"; account: StoredConnectAccount } | null> {
  return db.transaction(async (tx) => {
    const current = await lockConnectAccount(tx, input.accountRowId);
    if (!current) return null;

    const before = storedProjection(current);
    if (!projectionChanged(before, input.projection)) {
      const touched = await touchConnectAccountSyncedAt(tx, current.id);
      return { outcome: "unchanged" as const, account: touched };
    }

    const updated = await updateConnectAccountProjection(tx, {
      accountRowId: current.id,
      projection: input.projection,
      providerEventReference: input.providerEventReference,
    });
    const idempotencyKey = `payments-connect:account-synced:${updated.id}:${updated.revision}`;
    await appendAuditEntry(tx, {
      organizationId: updated.organizationId,
      locationId: null,
      actorUserId: input.actorUserId,
      action: "payments_connect.account_synced",
      targetType: AUDIT_TARGET_TYPE,
      targetId: updated.id,
      idempotencyKey,
      before: projectionRecord(before),
      after: projectionRecord(input.projection),
      metadata: {
        environment: updated.environment,
        providerAccountReference: updated.providerAccountReference,
        providerEventReference: input.providerEventReference,
        revision: updated.revision,
      },
    });
    await appendOutboxEvent(tx, {
      organizationId: updated.organizationId,
      locationId: null,
      eventName: "payments_connect.account_synced",
      aggregateType: AUDIT_TARGET_TYPE,
      aggregateId: updated.id,
      idempotencyKey,
      payload: {
        environment: updated.environment,
        revision: updated.revision,
        ...projectionRecord(input.projection),
      },
      occurredAt: input.now,
    });
    return { outcome: "synced" as const, account: updated };
  });
}

function isStale(account: StoredConnectAccount, now: Date): boolean {
  // Sin sincronizar nunca (fila recién creada): hay que leer Stripe.
  if (!account.lastSyncedAt) return true;
  return now.getTime() - account.lastSyncedAt.getTime() > REFRESH_AFTER_MS;
}

/** Estado de «Conectar Stripe» para la pantalla de ajustes de la academia. */
export async function getConnectStatus(
  input: { userId: string; organizationId: string; refresh: boolean },
  deps?: ConnectServiceDeps
): Promise<ConnectScreenState> {
  const parsed = statusInputSchema.parse(input);
  const now = deps?.now ?? new Date();
  const scope = await resolveOwnerScope({
    userId: parsed.userId,
    organizationId: parsed.organizationId,
  });

  const availability = await loadAvailability(scope, now);
  if (!availability.available && BLOCKING_REASONS_WITH_ACCOUNT.has(availability.reason)) {
    return { kind: "unavailable", reason: availability.reason };
  }

  // A partir de aquí el almacenamiento existe y el entorno es `test`.
  const account = await findConnectAccountForOrganization(db, scope.organization.id, "test");
  if (!account) {
    return availability.available
      ? { kind: "not_connected" }
      : { kind: "unavailable", reason: availability.reason };
  }

  if (!parsed.refresh || !isStale(account, now)) {
    return toScreenState(account);
  }

  let snapshot: ConnectAccountSnapshot;
  try {
    snapshot = await gatewayFrom(deps).retrieveAccount(account.providerAccountReference);
  } catch (error) {
    // Si Stripe no responde se muestra lo último guardado; el webhook o el
    // siguiente refresco lo pondrán al día.
    logger.warn("Conectar Stripe: no se pudo refrescar la cuenta conectada", {
      organizationId: scope.organization.id,
      accountId: account.providerAccountReference,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return toScreenState(account);
  }

  const persisted = await persistProjection({
    accountRowId: account.id,
    projection: projectConnectAccount(snapshot),
    actorUserId: parsed.userId,
    providerEventReference: null,
    now,
  });
  return toScreenState(persisted?.account ?? account);
}

/**
 * Crea (si hace falta) la cuenta conectada de la academia y devuelve un enlace
 * de alta de Stripe. Exige disponibilidad completa: bandera, entorno,
 * almacenamiento, rol, país y plan de pago.
 */
export async function startConnectOnboarding(
  input: { userId: string; organizationId: string },
  deps?: ConnectServiceDeps
): Promise<{ url: string }> {
  const parsed = ownerInputSchema.parse(input);
  const now = deps?.now ?? new Date();
  const scope = await resolveOwnerScope({
    userId: parsed.userId,
    organizationId: parsed.organizationId,
  });
  const organizationId = scope.organization.id;

  const availability = await loadAvailability(scope, now);
  if (!availability.available) {
    throw new OperationalError(
      "CONNECT_UNAVAILABLE",
      "Conectar Stripe no está disponible para esta academia ahora mismo.",
      409,
      { reason: availability.reason }
    );
  }
  const environment = availability.environment;
  const gateway = gatewayFrom(deps);

  let account = await findConnectAccountForOrganization(db, organizationId, environment);
  if (!account) {
    // Fuera de transacción. La clave de idempotencia por academia y entorno
    // hace que dos peticiones a la vez reciban normalmente la misma cuenta.
    // R8: solo academia y entorno, igual que la clave.
    let snapshot: ConnectAccountSnapshot;
    try {
      snapshot = await gateway.createAccount({ organizationId, environment });
    } catch (error) {
      // Otra petición con la misma clave sigue en curso en Stripe: la tarjeta
      // muestra su aviso de reintento.
      if (isStripeIdempotencyConflict(error)) {
        throw new OperationalError(
          "CONCURRENCY_RETRY",
          "Stripe todavía está preparando tu cuenta. Vuelve a intentarlo.",
          409
        );
      }
      throw error;
    }
    const projection = projectConnectAccount(snapshot);

    let inserted: StoredConnectAccount | null;
    try {
      inserted = await db.transaction(async (tx) => {
        const row = await insertConnectAccountIfAbsent(tx, {
          organizationId,
          environment,
          providerAccountReference: snapshot.id,
          projection,
        });
        if (!row) return null;

        const idempotencyKey = `payments-connect:account-created:${environment}:${organizationId}`;
        const after = {
          status: row.status,
          cardPaymentsCapabilityStatus: row.cardPaymentsCapabilityStatus,
          sepaDebitPaymentsCapabilityStatus: row.sepaDebitPaymentsCapabilityStatus,
          requirementsState: row.requirementsState,
        };
        await appendAuditEntry(tx, {
          organizationId,
          locationId: null,
          actorUserId: parsed.userId,
          action: "payments_connect.account_created",
          targetType: AUDIT_TARGET_TYPE,
          targetId: row.id,
          idempotencyKey,
          before: null,
          after,
          metadata: {
            environment,
            memberId: scope.member.id,
            providerAccountReference: row.providerAccountReference,
            revision: row.revision,
          },
        });
        await appendOutboxEvent(tx, {
          organizationId,
          locationId: null,
          eventName: "payments_connect.account_created",
          aggregateType: AUDIT_TARGET_TYPE,
          aggregateId: row.id,
          idempotencyKey,
          payload: { environment, revision: row.revision, ...after },
          occurredAt: now,
        });
        return row;
      });
    } catch (error) {
      // La cuenta ya existe en Stripe pero no quedó guardada: la clave de
      // idempotencia devolverá la misma cuenta en el siguiente intento. Solo ids.
      logger.error("Conectar Stripe: cuenta creada en Stripe sin guardar", error, {
        organizationId,
        accountId: snapshot.id,
      });
      throw error;
    }

    if (inserted) {
      account = inserted;
    } else {
      // Otra petición guardó la fila antes: se usa la suya.
      account = await findConnectAccountForOrganization(db, organizationId, environment);
      if (!account) {
        throw new Error("Connect account row missing after insert conflict");
      }
      if (account.providerAccountReference !== snapshot.id) {
        logger.warn("Conectar Stripe: Stripe devolvió otra cuenta para una academia que ya tenía una", {
          organizationId,
          storedAccountId: account.providerAccountReference,
          discardedAccountId: snapshot.id,
        });
      }
    }
  }

  return createOnboardingLinkFor(gateway, organizationId, account.providerAccountReference);
}

/** Enlace de alta de Stripe con las URLs de vuelta y de enlace caducado. */
function createOnboardingLinkFor(
  gateway: ConnectAccountsGateway,
  organizationId: string,
  accountReference: string
): Promise<{ url: string }> {
  const appUrl = getAppUrl();
  const organizationQuery = `organizationId=${encodeURIComponent(organizationId)}`;
  return gateway.createOnboardingLink({
    accountId: accountReference,
    returnUrl: `${appUrl}${CONNECT_RETURN_PATH}?${organizationQuery}&stripe=vuelta#cobro-automatico`,
    refreshUrl: `${appUrl}${CONNECT_LINK_ROUTE}?${organizationQuery}`,
  });
}

/**
 * Enlace nuevo para una cuenta conectada que ya existe (refresh_url de
 * Stripe, una navegación GET). Mismo alcance y disponibilidad que
 * `startConnectOnboarding`, pero nunca crea la cuenta ni escribe en la base:
 * sin fila lanza NOT_FOUND. Así un enlace de terceros abierto con la sesión
 * de la academia no puede crear una cuenta en su nombre.
 */
export async function renewConnectOnboardingLink(
  input: { userId: string; organizationId: string },
  deps?: ConnectServiceDeps
): Promise<{ url: string }> {
  const parsed = ownerInputSchema.parse(input);
  const now = deps?.now ?? new Date();
  const scope = await resolveOwnerScope({
    userId: parsed.userId,
    organizationId: parsed.organizationId,
  });
  const organizationId = scope.organization.id;

  const availability = await loadAvailability(scope, now);
  if (!availability.available) {
    throw new OperationalError(
      "CONNECT_UNAVAILABLE",
      "Conectar Stripe no está disponible para esta academia ahora mismo.",
      409,
      { reason: availability.reason }
    );
  }

  const account = await findConnectAccountForOrganization(db, organizationId, availability.environment);
  if (!account) {
    throw new OperationalError(
      "NOT_FOUND",
      "Esta academia todavía no ha conectado Stripe.",
      404
    );
  }

  return createOnboardingLinkFor(gatewayFrom(deps), organizationId, account.providerAccountReference);
}

/**
 * Webhook de la cuenta conectada (ya verificado por quien llama). El evento
 * solo avisa: se vuelve a leer la cuenta en Stripe y se proyecta.
 */
export async function syncConnectAccountFromEvent(
  input: { eventId: string; accountId: string; livemode: boolean },
  deps?: ConnectServiceDeps
): Promise<"synced" | "unchanged" | "ignored"> {
  const parsed = eventInputSchema.parse(input);
  const now = deps?.now ?? new Date();

  const environment = resolveConnectEnvironment();
  // Fase 1 solo existe en `test`: con clave Live (o desconocida) no se toca
  // nada, aunque el evento diga que es Live.
  if (environment !== "test") return "ignored";
  if ((parsed.livemode ? "live" : "test") !== environment) return "ignored";
  if (!ACCOUNT_REFERENCE.test(parsed.accountId)) return "ignored";
  if (!(await isConnectOnboardingStorageAvailable())) return "ignored";

  const account = await findConnectAccountByReference(db, environment, parsed.accountId);
  if (!account) return "ignored";

  const snapshot = await gatewayFrom(deps).retrieveAccount(account.providerAccountReference);
  const persisted = await persistProjection({
    accountRowId: account.id,
    projection: projectConnectAccount(snapshot),
    actorUserId: null,
    providerEventReference: parsed.eventId,
    now,
  });
  return persisted?.outcome ?? "ignored";
}

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobro automático de cuotas (Fase 4, Tarea 5): la familia confirma con su
 * banco, desde /familia/cuotas, el MISMO cobro que espera en
 * `requires_action`. Ruta POST /api/v1/family/automatic-payment/authentication
 * de punta a punta con el servicio real y el almacén, Stripe y la persona
 * pagadora simulados. Solo datos sintéticos y la hora fijada con
 * `vi.setSystemTime`: nunca llama a Stripe ni a la base ni depende del reloj.
 */

const env = vi.hoisted(() => ({
  flag: true,
  events: true,
  environment: "test" as "test" | "live" | null,
  production: false,
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: vi.fn(),
}));
vi.mock("@/modules/family-collection/application/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/family-collection/application/config")>()),
  isFamilyAutomaticCollectionFlagEnabled: () => env.flag,
  isFamilyAutomaticSepaCollectionFlagEnabled: () => false,
  isFamilyCollectionEventsFlagEnabled: () => env.events,
  resolveConnectEnvironment: () => env.environment,
  isProductionDatabase: () => env.production,
  isFamilyPaymentConfirmationOpen: () =>
    env.flag && env.events && env.environment === "test" && !env.production,
}));
vi.mock("@/modules/family-collection/infrastructure/family-collection-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/family-collection/infrastructure/family-collection-store")>()),
  createFamilyCollectionStore: vi.fn(),
  readLatestAttemptForAcademy: vi.fn(),
}));
vi.mock("@/modules/family-collection/infrastructure/stripe-collection-gateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/family-collection/infrastructure/stripe-collection-gateway")>()),
  createStripeCollectionGateway: vi.fn(),
  retrievePaymentClientSecret: vi.fn(),
}));
vi.mock("@/modules/family-payment-methods/infrastructure/family-payment-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/family-payment-methods/infrastructure/family-payment-store")>()),
  resolveFamilyPayer: vi.fn(),
}));
vi.mock("@/modules/payments-connect/infrastructure/connect-account-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/payments-connect/infrastructure/connect-account-store")>()),
  findConnectAccountForOrganization: vi.fn(),
}));
vi.mock("@/modules/payments-connect/application/connect-onboarding-service", () => ({
  refreshConnectAccountForCollection: vi.fn(),
}));

import { POST } from "@/app/api/v1/family/automatic-payment/authentication/route";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { processPaymentIntentEvent } from "@/modules/family-collection/application/family-collection-events";
import type { PaymentIntentSnapshot } from "@/modules/family-collection/domain/payment-outcome";
import {
  createFamilyCollectionStore,
  readLatestAttemptForAcademy,
  type AcademyAttemptView,
  type AttemptOutcome,
  type CollectionAttempt,
  type FamilyCollectionStore,
} from "@/modules/family-collection/infrastructure/family-collection-store";
import {
  createStripeCollectionGateway,
  retrievePaymentClientSecret,
  type FamilyCollectionGateway,
  type PaymentConfirmationSecret,
} from "@/modules/family-collection/infrastructure/stripe-collection-gateway";
import { resolveFamilyPayer } from "@/modules/family-payment-methods/infrastructure/family-payment-store";
import {
  findConnectAccountForOrganization,
  type StoredConnectAccount,
} from "@/modules/payments-connect/infrastructure/connect-account-store";

const userId = "45000000-0000-4000-8000-000000000101";
const otherUserId = "45000000-0000-4000-8000-000000000102";
const organizationId = "45000000-0000-4000-8000-000000000001";
const locationId = "45000000-0000-4000-8000-000000000002";
const familyId = "45000000-0000-4000-8000-000000000003";
const familyPayerId = "45000000-0000-4000-8000-000000000004";
const otherFamilyPayerId = "45000000-0000-4000-8000-000000000005";
const accountRowId = "45000000-0000-4000-8000-000000000006";
const authorizationId = "45000000-0000-4000-8000-000000000007";
const invoiceId = "45000000-0000-4000-8000-000000000008";
const attemptId = "45000000-0000-4000-8000-000000000009";
const chargeId = "45000000-0000-4000-8000-000000000010";
const connectedAccount = "acct_SyntheticAuth1";
const paymentIntentId = "pi_SyntheticAuth1";
const paymentMethod = "pm_SyntheticCard";
/** Valor sintético montado en tiempo de ejecución: no es un secreto real. */
const CLIENT_SECRET = [paymentIntentId, "secret", "synthetic"].join("_");
const origin = "https://zaltyko.test";
const url = `${origin}/api/v1/family/automatic-payment/authentication`;
/** Hora fija (Date simulado): 20-11-2026, 11:00 en Madrid. */
const NOW = new Date("2026-11-20T10:00:00.000Z");
/** Plazo: final del 22-11 en Madrid. */
const DEADLINE = new Date("2026-11-22T22:59:59.999Z");

const FAMILY_FLAG = "ZALTYKO_FAMILY_ACCESS_ENABLED";
const previousFamilyFlag = process.env[FAMILY_FLAG];

const account: StoredConnectAccount = {
  id: accountRowId,
  organizationId,
  environment: "test",
  providerAccountReference: connectedAccount,
  status: "active",
  cardPaymentsCapabilityStatus: "active",
  sepaDebitPaymentsCapabilityStatus: "active",
  requirementsState: "none",
  revision: 1,
  lastSyncedAt: null,
};

function waitingAttempt(overrides: Partial<CollectionAttempt> = {}): CollectionAttempt {
  return {
    id: attemptId,
    organizationId,
    locationId,
    invoiceId,
    familyId,
    familyPayerId,
    authorizationId,
    paymentProviderAccountId: accountRowId,
    attemptNumber: 2,
    paymentMethodKind: "card",
    amountCents: 4500,
    currency: "EUR",
    status: "requires_action",
    paymentIntentId,
    resumeCount: 0,
    claimedAt: new Date("2026-11-19T08:00:00.000Z"),
    ...overrides,
  };
}

function snapshot(status: string, code: string | null = null): PaymentIntentSnapshot {
  return {
    id: paymentIntentId,
    status,
    lastErrorCode: code,
    lastDeclineCode: null,
    amountReceivedCents: status === "succeeded" ? 4500 : 0,
    currency: "EUR",
    attemptIdFromMetadata: attemptId,
  };
}

function secret(overrides: Partial<PaymentConfirmationSecret> = {}): PaymentConfirmationSecret {
  return {
    id: paymentIntentId,
    status: "requires_payment_method",
    livemode: false,
    attemptIdFromMetadata: attemptId,
    // Tras el rechazo fuera de sesión, la tarjeta solo queda en el último error.
    paymentMethod,
    clientSecret: CLIENT_SECRET,
    ...overrides,
  };
}

/**
 * Almacén y Stripe en memoria. El almacén marca cuándo está «dentro de una
 * transacción» y Stripe falla el test si se le llama dentro de una.
 */
function makeWorld() {
  const world = {
    attempt: waitingAttempt(),
    deadline: DEADLINE as Date | null,
    /** Lo que Stripe tiene del cobro cuando se relee (por defecto, todavía sin confirmar). */
    stripe: snapshot("requires_payment_method", "authentication_required"),
    applied: [] as AttemptOutcome[],
    /** La cuota quedó pagada (pago registrado y repartido). */
    paid: false,
    inTransaction: false,
    stripeCalls: [] as string[],
  };

  const unused = (name: string) => async () => {
    throw new Error(`La confirmación de la familia no usa ${name}`);
  };

  const store: FamilyCollectionStore = {
    isStorageAvailable: vi.fn<FamilyCollectionStore["isStorageAvailable"]>(async () => true),
    isEventsStorageAvailable: vi.fn<FamilyCollectionStore["isEventsStorageAvailable"]>(async () => true),
    readActionDeadline: vi.fn<FamilyCollectionStore["readActionDeadline"]>(async (input) =>
      input.attemptId === world.attempt.id && world.attempt.status === "requires_action" ? world.deadline : null
    ),
    listDueInvoices: vi.fn<FamilyCollectionStore["listDueInvoices"]>(unused("listDueInvoices")),
    loadInvoiceContext: vi.fn<FamilyCollectionStore["loadInvoiceContext"]>(unused("loadInvoiceContext")),
    claimOrCancel: vi.fn<FamilyCollectionStore["claimOrCancel"]>(unused("claimOrCancel")),
    claimResumable: vi.fn<FamilyCollectionStore["claimResumable"]>(unused("claimResumable")),
    releaseResume: vi.fn<FamilyCollectionStore["releaseResume"]>(unused("releaseResume")),
    listProcessing: vi.fn<FamilyCollectionStore["listProcessing"]>(unused("listProcessing")),
    listLateSuccessPending: vi.fn<FamilyCollectionStore["listLateSuccessPending"]>(unused("listLateSuccessPending")),
    listExhaustedWithoutNotice: vi.fn<FamilyCollectionStore["listExhaustedWithoutNotice"]>(
      unused("listExhaustedWithoutNotice")
    ),
    markCreated: vi.fn<FamilyCollectionStore["markCreated"]>(unused("markCreated")),
    findClaimedAttemptById: vi.fn<FamilyCollectionStore["findClaimedAttemptById"]>(async () => null),
    findAttemptByPaymentIntent: vi.fn<FamilyCollectionStore["findAttemptByPaymentIntent"]>(async (input) =>
      input.organizationId === organizationId && input.paymentIntentId === world.attempt.paymentIntentId
        ? { ...world.attempt }
        : null
    ),
    listInvoiceSiblings: vi.fn<FamilyCollectionStore["listInvoiceSiblings"]>(async () => []),
    applyOutcome: vi.fn<FamilyCollectionStore["applyOutcome"]>(async (input) => {
      world.inTransaction = true;
      try {
        world.applied.push(input.outcome);
        const open = ["claimed", "created", "processing", "requires_action"].includes(world.attempt.status);
        if (input.attemptId !== world.attempt.id || !open) return { applied: false };
        if (input.outcome.kind === "succeeded") {
          world.attempt = { ...world.attempt, status: "succeeded" };
          world.paid = true;
          return { applied: true, status: "succeeded", allocationStatus: "allocated", reviewReasons: [] };
        }
        if (input.outcome.kind === "failed") {
          world.attempt = { ...world.attempt, status: "failed" };
          return { applied: true, status: "failed", allocationStatus: null, reviewReasons: [] };
        }
        throw new Error(`Resultado inesperado en este test: ${input.outcome.kind}`);
      } finally {
        world.inTransaction = false;
      }
    }),
    loadAttemptRefs: vi.fn<FamilyCollectionStore["loadAttemptRefs"]>(async () => ({
      connectedAccount,
      customer: "cus_SyntheticAuth",
      paymentMethod,
      mandate: null,
      timezone: "Europe/Madrid",
      servicePeriodStart: "2026-11-01",
      firstAttemptClaimedAt: new Date("2026-11-16T08:00:00.000Z"),
      allocations: [{ chargeId, amountCents: 4500 }],
      windowAnchorLocalDate: "2026-11-19",
    })),
    recordNotice: vi.fn<FamilyCollectionStore["recordNotice"]>(async () => true),
  };

  const outside = (name: string) => {
    world.stripeCalls.push(name);
    if (world.inTransaction) throw new Error(`Stripe dentro de una transacción: ${name}`);
  };
  const gateway: FamilyCollectionGateway = {
    createPayment: vi.fn<FamilyCollectionGateway["createPayment"]>(async () => {
      throw new Error("Nunca se crea otro cobro");
    }),
    confirmPayment: vi.fn<FamilyCollectionGateway["confirmPayment"]>(async () => {
      throw new Error("Nunca se reintenta solo");
    }),
    retrievePayment: vi.fn<FamilyCollectionGateway["retrievePayment"]>(async () => {
      outside("retrievePayment");
      return { ...world.stripe };
    }),
    findPaymentByAttempt: vi.fn<FamilyCollectionGateway["findPaymentByAttempt"]>(async () => null),
    cancelPayment: vi.fn<FamilyCollectionGateway["cancelPayment"]>(async () => {
      throw new Error("Antes del plazo nunca se cancela");
    }),
  };

  return { world, store, gateway };
}

let current: ReturnType<typeof makeWorld>;

function post(body: unknown, options: { origin?: string | null } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const requestOrigin = options.origin === undefined ? origin : options.origin;
  if (requestOrigin !== null) headers.origin = requestOrigin;
  return POST(new Request(url, { method: "POST", headers, body: JSON.stringify(body) }));
}

const start = { action: "start", organizationId, invoiceId };
const check = { action: "check", organizationId, invoiceId };

/** Todo lo que fue al registro, como texto. */
function logged(): string {
  return JSON.stringify([
    vi.mocked(logger.warn).mock.calls,
    vi.mocked(logger.info).mock.calls,
    vi.mocked(logger.error).mock.calls,
    vi.mocked(logger.debug).mock.calls,
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  process.env[FAMILY_FLAG] = "true";
  env.flag = true;
  env.events = true;
  env.environment = "test";
  env.production = false;

  current = makeWorld();
  vi.mocked(createFamilyCollectionStore).mockImplementation(() => current.store);
  vi.mocked(createStripeCollectionGateway).mockImplementation(() => current.gateway);
  vi.mocked(retrievePaymentClientSecret).mockImplementation(async () => {
    if (current.world.inTransaction) throw new Error("Stripe dentro de una transacción");
    return secret();
  });
  vi.mocked(readLatestAttemptForAcademy).mockImplementation(async (input) =>
    input.organizationId === organizationId && input.invoiceId === invoiceId
      ? ({
          ...current.world.attempt,
          nextRetryAt: null,
          updatedAt: NOW,
          hasReviewNotice: false,
        } satisfies AcademyAttemptView)
      : null
  );
  vi.mocked(resolveFamilyPayer).mockImplementation(async (_executor, input) =>
    input.userId === userId && input.organizationId === organizationId && input.familyId === familyId
      ? { guardianId: "45000000-0000-4000-8000-000000000201", familyPayerId }
      : null
  );
  vi.mocked(findConnectAccountForOrganization).mockResolvedValue(account);
  vi.mocked(getCurrentUser).mockResolvedValue({ id: userId } as Awaited<ReturnType<typeof getCurrentUser>>);
  vi.mocked(rateLimit).mockResolvedValue({ success: true, limit: 10, remaining: 9, reset: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => {
  if (previousFamilyFlag === undefined) delete process.env[FAMILY_FLAG];
  else process.env[FAMILY_FLAG] = previousFamilyFlag;
});

describe("POST /api/v1/family/automatic-payment/authentication — start", () => {
  it("start: solo la persona pagadora vigente; otra cuenta de la familia → 404", async () => {
    const ok = await post(start);
    expect(ok.status).toBe(200);
    expect((await ok.json()).data.clientSecret).toBe(CLIENT_SECRET);

    // Otra persona de la familia (no es la pagadora vigente): 404, sin leer Stripe.
    vi.mocked(retrievePaymentClientSecret).mockClear();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: otherUserId } as Awaited<ReturnType<typeof getCurrentUser>>);
    const other = await post(start);
    expect(other.status).toBe(404);
    const otherBody = await other.json();
    expect(otherBody).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(JSON.stringify(otherBody)).not.toContain(CLIENT_SECRET);

    // La pagadora vigente ya no es la del intento (cambió la persona pagadora): tampoco.
    vi.mocked(getCurrentUser).mockResolvedValue({ id: userId } as Awaited<ReturnType<typeof getCurrentUser>>);
    vi.mocked(resolveFamilyPayer).mockResolvedValue({
      guardianId: "45000000-0000-4000-8000-000000000202",
      familyPayerId: otherFamilyPayerId,
    });
    expect((await post(start)).status).toBe(404);

    // Una cuota de otra academia o sin intento: el mismo 404 (no dice si hay un cobro).
    const foreign = await post({ ...start, organizationId: "45000000-0000-4000-8000-000000000099" });
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual(otherBody);
    expect(retrievePaymentClientSecret).not.toHaveBeenCalled();
  });

  it("start: plazo pasado o intento cerrado → 409 sin client_secret", async () => {
    const expectConflict = async (code: string) => {
      const response = await post(start);
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body).toMatchObject({ ok: false, code });
      expect(JSON.stringify(body)).not.toContain(CLIENT_SECRET);
      expect(JSON.stringify(body)).not.toMatch(/pi_|pm_|acct_/);
    };

    // Plazo pasado (el proceso diario aún no lo cerró): ni se lee Stripe.
    current.world.deadline = new Date("2026-11-19T22:59:59.999Z");
    await expectConflict("FAMILY_PAYMENT_CONFIRMATION_EXPIRED");
    // Justo en el último instante del plazo aún vale.
    vi.setSystemTime(DEADLINE);
    current.world.deadline = DEADLINE;
    expect((await post(start)).status).toBe(200);
    vi.setSystemTime(new Date(DEADLINE.getTime() + 1));
    await expectConflict("FAMILY_PAYMENT_CONFIRMATION_EXPIRED");
    vi.setSystemTime(NOW);
    vi.mocked(retrievePaymentClientSecret).mockClear();

    // Intento cerrado (cobrado, fallido o cancelado).
    for (const status of ["succeeded", "failed", "canceled", "processing"] as const) {
      current.world.attempt = waitingAttempt({ status });
      await expectConflict("FAMILY_PAYMENT_CONFIRMATION_CLOSED");
    }
    expect(retrievePaymentClientSecret).not.toHaveBeenCalled();
    current.world.attempt = waitingAttempt();

    // Stripe ya no deja confirmarlo (cobrado o cancelado en Stripe), o no cuadra: 409.
    for (const overrides of [
      { status: "succeeded" },
      { status: "canceled" },
      { status: "processing" },
      { livemode: true },
      { attemptIdFromMetadata: "45000000-0000-4000-8000-000000000099" },
      { id: "pi_SyntheticOther" },
      { paymentMethod: "pm_SyntheticOtherCard" },
      { clientSecret: null },
    ] satisfies Array<Partial<PaymentConfirmationSecret>>) {
      vi.mocked(retrievePaymentClientSecret).mockResolvedValueOnce(secret(overrides));
      await expectConflict("FAMILY_PAYMENT_CONFIRMATION_CLOSED");
    }

    // La cuenta del intento no es la de prueba de la academia.
    vi.mocked(findConnectAccountForOrganization).mockResolvedValueOnce({ ...account, id: "45000000-0000-4000-8000-000000000098" });
    await expectConflict("FAMILY_PAYMENT_CONFIRMATION_CLOSED");

    // Nunca se escribió nada ni se creó, confirmó o canceló otro cobro.
    expect(current.store.applyOutcome).not.toHaveBeenCalled();
    expect(current.gateway.createPayment).not.toHaveBeenCalled();
    expect(current.gateway.confirmPayment).not.toHaveBeenCalled();
    expect(current.gateway.cancelPayment).not.toHaveBeenCalled();
  });

  it("start: la respuesta no se registra ni lleva más que clientSecret, connectedAccount y paymentMethodId", async () => {
    const response = await post(start);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(Object.keys(body.data).sort()).toEqual(["clientSecret", "connectedAccount", "paymentMethodId"]);
    expect(body.data).toEqual({ clientSecret: CLIENT_SECRET, connectedAccount, paymentMethodId: paymentMethod });
    // Leído en ese momento en la cuenta de la academia; nada se escribe.
    expect(retrievePaymentClientSecret).toHaveBeenCalledWith({ connectedAccount, paymentIntentId });
    expect(current.store.applyOutcome).not.toHaveBeenCalled();
    expect(logged()).not.toContain(CLIENT_SECRET);

    // Un error inesperado de Stripe: 502 con texto sencillo; al registro solo ids y el nombre.
    vi.mocked(retrievePaymentClientSecret).mockRejectedValueOnce(
      Object.assign(new Error(`Mensaje sintético de Stripe con ${CLIENT_SECRET}`), { name: "StripeConnectionError" })
    );
    const failed = await post(start);
    expect(failed.status).toBe(502);
    const failedBody = await failed.json();
    expect(failedBody).toMatchObject({ ok: false, code: "FAMILY_PAYMENT_CONFIRMATION_FAILED" });
    expect(JSON.stringify(failedBody)).not.toContain(CLIENT_SECRET);
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), {
      action: "start",
      organizationId,
      invoiceId,
      errorName: "StripeConnectionError",
    });
    expect(logged()).not.toContain(CLIENT_SECRET);
    expect(logged()).not.toContain("Mensaje sintético");
  });

  it("cerrojos: con una bandera apagada, en Live o contra producción, 503 sin tocar la base ni Stripe", async () => {
    for (const change of [
      () => (env.flag = false),
      () => (env.events = false),
      () => (env.environment = "live"),
      () => (env.production = true),
    ]) {
      env.flag = true;
      env.events = true;
      env.environment = "test";
      env.production = false;
      change();
      const response = await post(start);
      expect(response.status).toBe(503);
      expect(JSON.stringify(await response.json())).not.toContain(CLIENT_SECRET);
    }
    // Sin la forma "phase4": 503 también.
    env.flag = true;
    env.events = true;
    env.environment = "test";
    env.production = false;
    vi.mocked(current.store.isEventsStorageAvailable).mockResolvedValue(false);
    expect((await post(check)).status).toBe(503);

    expect(readLatestAttemptForAcademy).not.toHaveBeenCalled();
    expect(resolveFamilyPayer).not.toHaveBeenCalled();
    expect(retrievePaymentClientSecret).not.toHaveBeenCalled();
    expect(current.gateway.retrievePayment).not.toHaveBeenCalled();
  });

  it("acceso: otra web, sin sesión, demasiados intentos o un cuerpo con campos de más → sin servicio", async () => {
    expect((await post(start, { origin: "https://otra.example" })).status).toBe(403);
    expect((await post(start, { origin: null })).status).toBe(403);

    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    expect((await post(start)).status).toBe(401);

    vi.mocked(rateLimit).mockResolvedValueOnce({ success: false, limit: 10, remaining: 0, reset: 0 });
    expect((await post(start)).status).toBe(429);

    expect((await post({ ...start, paymentIntentId })).status).toBe(400);
    expect((await post({ ...start, action: "retry" })).status).toBe(400);
    expect((await post({ ...start, invoiceId: "no-es-un-id" })).status).toBe(400);

    process.env[FAMILY_FLAG] = "false";
    expect((await post(start)).status).toBe(503);

    expect(readLatestAttemptForAcademy).not.toHaveBeenCalled();
    expect(retrievePaymentClientSecret).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/family/automatic-payment/authentication — check", () => {
  it("check tras confirmar → collected y cuota pagada (mismo camino que el evento)", async () => {
    // La familia confirmó en el navegador y Stripe ya lo da por cobrado.
    current.world.stripe = snapshot("succeeded");

    const response = await post(check);

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ state: "collected" });
    expect(current.world.paid).toBe(true);
    expect(current.world.applied).toEqual([
      { kind: "succeeded", paymentIntentId, received: { amountCents: 4500, currency: "EUR" } },
    ]);
    // Se releyó en Stripe, fuera de la transacción, y nunca se creó ni se confirmó otro cobro.
    expect(current.world.stripeCalls).toEqual(["retrievePayment"]);
    expect(current.gateway.retrievePayment).toHaveBeenCalledWith({ connectedAccount, paymentIntentId });
    expect(current.gateway.createPayment).not.toHaveBeenCalled();
    expect(current.gateway.confirmPayment).not.toHaveBeenCalled();

    // El evento `payment_intent.succeeded` del mismo cobro escribe exactamente lo mismo.
    const viaCheck = current.world.applied;
    const twin = makeWorld();
    twin.world.stripe = snapshot("succeeded");
    const event = await processPaymentIntentEvent(
      {
        organizationId,
        account,
        objectId: paymentIntentId,
        now: NOW,
        inboxId: "45000000-0000-4000-8000-000000000301",
        eventId: "evt_SyntheticAuth1",
      },
      { store: twin.store, gateway: twin.gateway }
    );
    expect(event.result?.collected).toBe(1);
    expect(twin.world.applied).toEqual(viaCheck);
    expect(twin.world.paid).toBe(true);

    // Después del evento (o de otra comprobación), el intento ya está cobrado: sin releer Stripe.
    vi.mocked(current.gateway.retrievePayment).mockClear();
    const again = await post(check);
    expect((await again.json()).data).toEqual({ state: "collected" });
    expect(current.gateway.retrievePayment).not.toHaveBeenCalled();
  });

  it("check: el banco aún no lo confirmó → sigue esperando, sin escribir, cancelar ni reintentar", async () => {
    // Stripe sigue pidiendo que la familia lo confirme (cerró la ventana del banco).
    const response = await post(check);

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ state: "action_required" });
    expect(current.store.applyOutcome).not.toHaveBeenCalled();
    expect(current.gateway.cancelPayment).not.toHaveBeenCalled();
    expect(current.gateway.confirmPayment).not.toHaveBeenCalled();
    expect(current.gateway.createPayment).not.toHaveBeenCalled();
    expect(current.world.attempt.status).toBe("requires_action");
  });

  it("check: otra cuenta de la familia → 404 sin releer Stripe", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: otherUserId } as Awaited<ReturnType<typeof getCurrentUser>>);

    const response = await post(check);

    expect(response.status).toBe(404);
    expect(current.gateway.retrievePayment).not.toHaveBeenCalled();
  });

  it("check: si Stripe no deja leerlo, 502 con texto sencillo y el intento como estaba", async () => {
    vi.mocked(current.gateway.retrievePayment).mockRejectedValueOnce(
      Object.assign(new Error("Mensaje sintético de Stripe"), { name: "StripeAPIError" })
    );

    const response = await post(check);

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ ok: false, code: "FAMILY_PAYMENT_CHECK_FAILED" });
    expect(current.world.attempt.status).toBe("requires_action");
    expect(logged()).not.toContain("Mensaje sintético");
  });
});

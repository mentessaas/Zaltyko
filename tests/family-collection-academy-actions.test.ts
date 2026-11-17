import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobro automático (Fase 3): «Cancelar el cobro automático» y «Marcar como
 * revisado». Base y Stripe simulados.
 */

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/modules/family-collection/application/config", () => ({
  isFamilyAutomaticCollectionFlagEnabled: vi.fn(),
  resolveConnectEnvironment: vi.fn(),
  isProductionDatabase: vi.fn(),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: vi.fn(),
}));

import type Stripe from "stripe";

import {
  cancelAutomaticCollection,
  markAutomaticCollectionReviewed,
  type AcademyCollectionGateway,
  type AcademyCollectionStore,
} from "@/modules/family-collection/application/family-collection-academy-actions";
import {
  isFamilyAutomaticCollectionFlagEnabled,
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-collection/application/config";
import type { PaymentIntentSnapshot } from "@/modules/family-collection/domain/payment-outcome";
import type {
  AcademyAttemptView,
  AttemptStripeRefs,
} from "@/modules/family-collection/infrastructure/family-collection-store";
import {
  listCollectionPaymentsByAttempt,
  type FamilyCollectionGateway,
} from "@/modules/family-collection/infrastructure/stripe-collection-gateway";
import { resolveOwnerScope, type OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

const userId = "10000000-0000-4000-8000-000000000101";
const organizationId = "10000000-0000-4000-8000-000000000001";
const memberId = "10000000-0000-4000-8000-000000000201";
const invoiceId = "10000000-0000-4000-8000-000000000008";
const attemptId = "10000000-0000-4000-8000-000000000020";
// Referencias opacas sintéticas.
const paymentIntentId = "pi_SyntheticAcademy1";
const connectedAccount = "acct_SyntheticAcademy1";
const now = new Date("2026-11-17T10:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function ownerScope(member: Partial<OwnerScope["member"]> = {}): OwnerScope {
  return {
    organization: { id: organizationId, name: "Club Sintético", defaultCurrency: "EUR" },
    member: { id: memberId, role: "owner", locationScopeMode: "all", ...member },
    locations: [],
    selectedLocationId: null,
    canViewOrganizationAggregate: true,
  };
}

function attempt(overrides: Partial<AcademyAttemptView> = {}): AcademyAttemptView {
  return {
    id: attemptId,
    organizationId,
    locationId: "10000000-0000-4000-8000-000000000002",
    invoiceId,
    familyId: "10000000-0000-4000-8000-000000000003",
    familyPayerId: "10000000-0000-4000-8000-000000000010",
    authorizationId: "10000000-0000-4000-8000-000000000011",
    paymentProviderAccountId: "10000000-0000-4000-8000-000000000012",
    attemptNumber: 1,
    paymentMethodKind: "card",
    amountCents: 4500,
    currency: "EUR",
    status: "created",
    paymentIntentId,
    resumeCount: 0,
    claimedAt: now,
    nextRetryAt: null,
    updatedAt: now,
    hasReviewNotice: false,
    ...overrides,
  };
}

const refs: AttemptStripeRefs = {
  connectedAccount,
  customer: "cus_SyntheticAcademy1",
  paymentMethod: "pm_SyntheticAcademy1",
  mandate: null,
  timezone: "Europe/Madrid",
  servicePeriodStart: "2026-11-01",
  firstAttemptClaimedAt: now,
  allocations: [{ chargeId: "10000000-0000-4000-8000-000000000007", amountCents: 4500 }],
};

function fakeStore(current: AcademyAttemptView | null, overrides: Partial<AcademyCollectionStore> = {}) {
  return {
    isStorageAvailable: vi.fn<AcademyCollectionStore["isStorageAvailable"]>(async () => true),
    loadAttemptRefs: vi.fn<AcademyCollectionStore["loadAttemptRefs"]>(async () => refs),
    applyOutcome: vi.fn<AcademyCollectionStore["applyOutcome"]>(async () => ({
      applied: true,
      status: "succeeded",
      allocationStatus: "allocated",
      reviewReasons: [],
    })),
    readLatestAttempt: vi.fn<AcademyCollectionStore["readLatestAttempt"]>(async () => current),
    closeAttempt: vi.fn<AcademyCollectionStore["closeAttempt"]>(async () =>
      current ? { ...current, status: "canceled" } : null
    ),
    ...overrides,
  };
}

/** Lo que Stripe dice haber cobrado cuando la cuota (45 €) salió entera. */
const received = { amountCents: 4500, currency: "EUR" };

/**
 * Stripe simulado: cada cobro con su estado; cancelar lo deja cancelado. Un
 * cobro hecho dice haber cobrado `receivedCents` (por defecto, la cuota entera).
 */
function fakeGateway(
  statuses: Record<string, string> = {},
  cancelResult: "canceled" | "not_cancelable" = "canceled",
  receivedCents = 4500
) {
  const snapshot = (id: string): PaymentIntentSnapshot => {
    const status = statuses[id] ?? "requires_confirmation";
    return {
      id,
      status,
      lastErrorCode: null,
      lastDeclineCode: null,
      amountReceivedCents: status === "succeeded" ? receivedCents : 0,
      currency: "EUR",
    };
  };
  return {
    createPayment: vi.fn<FamilyCollectionGateway["createPayment"]>(),
    confirmPayment: vi.fn<FamilyCollectionGateway["confirmPayment"]>(),
    retrievePayment: vi.fn<FamilyCollectionGateway["retrievePayment"]>(async (input) => snapshot(input.paymentIntentId)),
    findPaymentByAttempt: vi.fn<FamilyCollectionGateway["findPaymentByAttempt"]>(async () => null),
    listPaymentsByAttempt: vi.fn<AcademyCollectionGateway["listPaymentsByAttempt"]>(async () => []),
    cancelPayment: vi.fn<FamilyCollectionGateway["cancelPayment"]>(async (input) => {
      if (cancelResult === "canceled") statuses[input.paymentIntentId] = "canceled";
      return cancelResult;
    }),
  };
}

const cancelInput = { userId, organizationId, invoiceId, now };
const reviewInput = { userId, organizationId, invoiceId, checkedInStripe: true, now };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isFamilyAutomaticCollectionFlagEnabled).mockReturnValue(true);
  vi.mocked(resolveConnectEnvironment).mockReturnValue("test");
  vi.mocked(isProductionDatabase).mockReturnValue(false);
  vi.mocked(resolveOwnerScope).mockResolvedValue(ownerScope());
});

describe("acceso", () => {
  it.each([
    ["con clave de Live", () => vi.mocked(resolveConnectEnvironment).mockReturnValue("live")],
    ["contra la base de producción", () => vi.mocked(isProductionDatabase).mockReturnValue(true)],
  ])("%s no está disponible y no consulta nada", async (_label, arrange) => {
    arrange();
    const store = fakeStore(attempt());
    await expect(cancelAutomaticCollection(cancelInput, { store, gateway: fakeGateway() })).rejects.toMatchObject({
      code: "FEATURE_NOT_AVAILABLE",
      status: 503,
    });
    expect(resolveOwnerScope).not.toHaveBeenCalled();
    expect(store.readLatestAttempt).not.toHaveBeenCalled();
  });

  it.each([
    ["dirección", { role: "manager" as const }],
    ["administración de una sede", { role: "admin" as const, locationScopeMode: "selected" as const }],
  ])("%s no puede gestionar el cobro", async (_label, member) => {
    vi.mocked(resolveOwnerScope).mockResolvedValue(ownerScope(member as Partial<OwnerScope["member"]>));
    const store = fakeStore(attempt());
    await expect(cancelAutomaticCollection(cancelInput, { store, gateway: fakeGateway() })).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    expect(store.readLatestAttempt).not.toHaveBeenCalled();
  });

  it("funciona con la bandera apagada (la academia cierra lo que quedó abierto)", async () => {
    vi.mocked(isFamilyAutomaticCollectionFlagEnabled).mockReturnValue(false);
    const store = fakeStore(attempt({ status: "failed", paymentIntentId: null, nextRetryAt: new Date("2026-11-20T08:00:00Z") }));
    await expect(cancelAutomaticCollection(cancelInput, { store, gateway: fakeGateway() })).resolves.toEqual({
      outcome: "canceled",
    });
  });

  it("sin las tablas responde 503", async () => {
    const store = fakeStore(attempt(), { isStorageAvailable: vi.fn(async () => false) });
    await expect(cancelAutomaticCollection(cancelInput, { store, gateway: fakeGateway() })).rejects.toMatchObject({
      code: "FEATURE_NOT_AVAILABLE",
    });
    expect(store.readLatestAttempt).not.toHaveBeenCalled();
  });
});

describe("cancelar el cobro automático", () => {
  it("con un reintento pendiente lo cierra como canceled_by_academy sin tocar Stripe", async () => {
    const current = attempt({ status: "failed", nextRetryAt: new Date("2026-11-20T08:00:00Z") });
    const store = fakeStore(current);
    const gateway = fakeGateway();

    await expect(cancelAutomaticCollection(cancelInput, { store, gateway })).resolves.toEqual({ outcome: "canceled" });

    expect(store.closeAttempt).toHaveBeenCalledWith({
      organizationId,
      attemptId,
      expected: { status: "failed", paymentIntentId, retryPending: true },
      reason: "canceled_by_academy",
      actor: { userId, memberId },
      now,
    });
    expect(gateway.retrievePayment).not.toHaveBeenCalled();
    expect(gateway.cancelPayment).not.toHaveBeenCalled();
  });

  it.each([
    ["sin intentos", null],
    ["con un fallo final", attempt({ status: "failed", nextRetryAt: null })],
    ["ya cobrada", attempt({ status: "succeeded" })],
    ["ya cancelada", attempt({ status: "canceled" })],
  ])("%s no hay nada que cancelar", async (_label, current) => {
    const store = fakeStore(current);
    await expect(cancelAutomaticCollection(cancelInput, { store, gateway: fakeGateway() })).rejects.toMatchObject({
      code: "AUTOMATIC_COLLECTION_NOTHING_PENDING",
      status: 409,
    });
    expect(store.closeAttempt).not.toHaveBeenCalled();
  });

  it("un cobro en curso en el banco no se puede cancelar (409 con texto claro)", async () => {
    const store = fakeStore(attempt({ status: "processing" }));
    const gateway = fakeGateway();
    await expect(cancelAutomaticCollection(cancelInput, { store, gateway })).rejects.toMatchObject({
      code: "AUTOMATIC_COLLECTION_PROCESSING",
      status: 409,
      message: "Este cobro ya se envió al banco y no se puede cancelar. Espera al resultado.",
    });
    expect(gateway.retrievePayment).not.toHaveBeenCalled();
    expect(store.closeAttempt).not.toHaveBeenCalled();
  });

  it("un cobro que se está reclamando ahora mismo responde 409", async () => {
    const store = fakeStore(attempt({ status: "claimed", paymentIntentId: null }));
    await expect(cancelAutomaticCollection(cancelInput, { store, gateway: fakeGateway() })).rejects.toMatchObject({
      code: "AUTOMATIC_COLLECTION_IN_PROGRESS",
      message: "Esta cuota se está cobrando automáticamente. Espera al resultado.",
    });
    expect(store.closeAttempt).not.toHaveBeenCalled();
  });

  it("creado sin confirmar: primero se cancela en Stripe y después se cierra", async () => {
    const order: string[] = [];
    const store = fakeStore(attempt(), {
      closeAttempt: vi.fn(async () => {
        order.push("close");
        return { ...attempt(), status: "canceled" as const };
      }),
    });
    const gateway = fakeGateway();
    gateway.cancelPayment.mockImplementation(async () => {
      order.push("stripe");
      return "canceled";
    });

    await expect(cancelAutomaticCollection(cancelInput, { store, gateway })).resolves.toEqual({ outcome: "canceled" });

    expect(gateway.cancelPayment).toHaveBeenCalledWith({ connectedAccount, paymentIntentId });
    expect(order).toEqual(["stripe", "close"]);
    expect(store.closeAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ expected: { status: "created", paymentIntentId }, reason: "canceled_by_academy" })
    );
  });

  it("si Stripe ya lo cobró, nunca se cierra: se registra por el camino del proceso diario", async () => {
    const store = fakeStore(attempt());
    const gateway = fakeGateway({ [paymentIntentId]: "succeeded" });

    await expect(cancelAutomaticCollection(cancelInput, { store, gateway })).resolves.toEqual({ outcome: "collected" });

    expect(gateway.cancelPayment).not.toHaveBeenCalled();
    expect(store.closeAttempt).not.toHaveBeenCalled();
    expect(store.applyOutcome).toHaveBeenCalledWith({
      organizationId,
      attemptId,
      outcome: { kind: "succeeded", paymentIntentId, received },
      environment: "test",
      now,
    });
  });

  it("Stripe cobró otro importe: se pasa tal cual, no se registra ni se cierra y responde 409 para soporte", async () => {
    const store = fakeStore(attempt(), {
      applyOutcome: vi.fn<AcademyCollectionStore["applyOutcome"]>(async () => ({
        applied: false as const,
        review: "amount_mismatch",
      })),
    });
    const gateway = fakeGateway({ [paymentIntentId]: "succeeded" }, "canceled", 4000);

    await expect(cancelAutomaticCollection(cancelInput, { store, gateway })).rejects.toMatchObject({
      code: "AUTOMATIC_COLLECTION_NEEDS_SUPPORT",
      status: 409,
      message:
        "Stripe cobró un importe distinto al de esta cuota y no lo hemos registrado. Resuélvelo en Stripe con su soporte; no se puede marcar como revisado.",
    });
    expect(store.applyOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: { kind: "succeeded", paymentIntentId, received: { amountCents: 4000, currency: "EUR" } },
      })
    );
    expect(gateway.cancelPayment).not.toHaveBeenCalled();
    expect(store.closeAttempt).not.toHaveBeenCalled();
  });

  it("cobrado pero ya registrado para otro intento: 409 que manda a «Marcar como revisado», sin cerrar", async () => {
    const store = fakeStore(attempt(), {
      applyOutcome: vi.fn(async () => ({ applied: false as const, review: "payment_recorded_for_other_attempt" })),
    });
    const gateway = fakeGateway({ [paymentIntentId]: "succeeded" });

    await expect(cancelAutomaticCollection(cancelInput, { store, gateway })).rejects.toMatchObject({
      code: "AUTOMATIC_COLLECTION_REVIEW_REQUIRED",
      status: 409,
      message: "Este cobro ya figura registrado con otro cobro automático. Revísalo y usa «Marcar como revisado».",
    });
    expect(store.closeAttempt).not.toHaveBeenCalled();
  });

  it("si Stripe ya no deja cancelarlo y al releerlo está cobrado, se registra", async () => {
    const store = fakeStore(attempt());
    const statuses: Record<string, string> = {};
    const gateway = fakeGateway(statuses, "not_cancelable");
    gateway.cancelPayment.mockImplementation(async () => {
      statuses[paymentIntentId] = "succeeded";
      return "not_cancelable";
    });

    await expect(cancelAutomaticCollection(cancelInput, { store, gateway })).resolves.toEqual({ outcome: "collected" });
    expect(store.closeAttempt).not.toHaveBeenCalled();
  });

  it("si Stripe dice que está en el banco, 409 y no se cierra", async () => {
    const store = fakeStore(attempt());
    const gateway = fakeGateway({ [paymentIntentId]: "processing" });
    await expect(cancelAutomaticCollection(cancelInput, { store, gateway })).rejects.toMatchObject({
      code: "AUTOMATIC_COLLECTION_PROCESSING",
    });
    expect(gateway.cancelPayment).not.toHaveBeenCalled();
    expect(store.closeAttempt).not.toHaveBeenCalled();
  });

  it("si no se puede leer Stripe, 503 y no se cierra", async () => {
    const store = fakeStore(attempt());
    const gateway = fakeGateway();
    gateway.retrievePayment.mockRejectedValue(new Error("network"));
    await expect(cancelAutomaticCollection(cancelInput, { store, gateway })).rejects.toMatchObject({
      code: "AUTOMATIC_COLLECTION_UNVERIFIED",
      status: 503,
    });
    expect(gateway.cancelPayment).not.toHaveBeenCalled();
    expect(store.closeAttempt).not.toHaveBeenCalled();
  });

  it("si el intento cambió mientras tanto, 409 para recargar", async () => {
    const store = fakeStore(attempt({ status: "failed", nextRetryAt: new Date("2026-11-20T08:00:00Z") }), {
      closeAttempt: vi.fn(async () => null),
    });
    await expect(cancelAutomaticCollection(cancelInput, { store, gateway: fakeGateway() })).rejects.toMatchObject({
      code: "CONCURRENCY_RETRY",
      status: 409,
    });
  });
});

describe("marcar como revisado", () => {
  it("exige confirmar que se comprobó en Stripe, antes de consultar nada", async () => {
    const store = fakeStore(attempt({ hasReviewNotice: true }));
    await expect(
      markAutomaticCollectionReviewed({ ...reviewInput, checkedInStripe: false }, { store, gateway: fakeGateway() })
    ).rejects.toMatchObject({ code: "AUTOMATIC_COLLECTION_CONFIRMATION_REQUIRED", status: 422 });
    expect(resolveOwnerScope).not.toHaveBeenCalled();
    expect(store.readLatestAttempt).not.toHaveBeenCalled();
  });

  it.each([
    ["sin intentos", null],
    ["con un intento cerrado", attempt({ status: "failed", hasReviewNotice: true })],
  ])("%s no hay nada que revisar", async (_label, current) => {
    const store = fakeStore(current);
    await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway: fakeGateway() })).rejects.toMatchObject({
      code: "AUTOMATIC_COLLECTION_NOTHING_PENDING",
    });
  });

  it("un cobro que sigue su curso, sin aviso ni reanudaciones agotadas, no necesita revisión", async () => {
    const store = fakeStore(attempt({ resumeCount: 2 }));
    const gateway = fakeGateway();
    await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).rejects.toMatchObject({
      code: "AUTOMATIC_COLLECTION_REVIEW_NOT_NEEDED",
      status: 409,
    });
    expect(gateway.retrievePayment).not.toHaveBeenCalled();
    expect(store.closeAttempt).not.toHaveBeenCalled();
  });

  it("abierto más de 24 h sin cambios y sin aviso: lee Stripe y, si no salió dinero, lo cierra", async () => {
    const store = fakeStore(attempt({ updatedAt: new Date(now.getTime() - 25 * HOUR) }));
    const gateway = fakeGateway();

    await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).resolves.toEqual({
      outcome: "reviewed",
    });
    expect(gateway.retrievePayment).toHaveBeenCalledWith({ connectedAccount, paymentIntentId });
    expect(gateway.cancelPayment).toHaveBeenCalledWith({ connectedAccount, paymentIntentId });
    expect(store.closeAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "reviewed_by_academy", expected: { status: "created", paymentIntentId } })
    );
  });

  it("abierto más de 24 h sin aviso y el dinero ya salió: se registra y nunca se cierra", async () => {
    const store = fakeStore(attempt({ updatedAt: new Date(now.getTime() - 25 * HOUR) }));
    const gateway = fakeGateway({ [paymentIntentId]: "succeeded" });

    await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).resolves.toEqual({
      outcome: "collected",
    });
    expect(store.applyOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: { kind: "succeeded", paymentIntentId, received } })
    );
    expect(gateway.cancelPayment).not.toHaveBeenCalled();
    expect(store.closeAttempt).not.toHaveBeenCalled();
  });

  it("abierto más de 24 h sin aviso y la domiciliación en el banco: 409 y no se cierra", async () => {
    const store = fakeStore(attempt({ updatedAt: new Date(now.getTime() - 25 * HOUR) }));
    const gateway = fakeGateway({ [paymentIntentId]: "processing" });

    await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).rejects.toMatchObject({
      code: "AUTOMATIC_COLLECTION_PROCESSING",
      status: 409,
    });
    expect(store.closeAttempt).not.toHaveBeenCalled();
  });

  it("menos de 24 h sin cambios, o en el banco aunque haga días, sin aviso: no necesita revisión", async () => {
    for (const current of [
      attempt({ updatedAt: new Date(now.getTime() - 23 * HOUR) }),
      attempt({ status: "processing", updatedAt: new Date(now.getTime() - 5 * 24 * HOUR) }),
    ]) {
      const store = fakeStore(current);
      const gateway = fakeGateway();
      await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway }), current.status).rejects.toMatchObject({
        code: "AUTOMATIC_COLLECTION_REVIEW_NOT_NEEDED",
      });
      expect(gateway.retrievePayment).not.toHaveBeenCalled();
    }
  });

  describe("en curso desde hace más de 15 días (processing ilegible)", () => {
    const DAY = 24 * HOUR;
    // Errores tal como los lanza stripe-node 22 (`type` = clase, `code` = código de la API).
    const accountInvalid = () =>
      Object.assign(new Error("sin acceso"), { type: "StripePermissionError", code: "account_invalid", statusCode: 403 });
    const resourceMissing = () =>
      Object.assign(new Error("no existe"), { type: "StripeInvalidRequestError", code: "resource_missing", statusCode: 404 });
    const networkError = () => Object.assign(new Error("connection reset"), { type: "StripeConnectionError" });
    const longProcessing = (days: number) =>
      attempt({
        status: "processing",
        paymentMethodKind: "sepa_debit",
        claimedAt: new Date(now.getTime() - days * DAY),
        updatedAt: new Date(now.getTime() - days * DAY),
      });

    it("14 días sin aviso: todavía no necesita revisión y no lee Stripe", async () => {
      const store = fakeStore(longProcessing(14));
      const gateway = fakeGateway();
      await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).rejects.toMatchObject({
        code: "AUTOMATIC_COLLECTION_REVIEW_NOT_NEEDED",
      });
      expect(gateway.retrievePayment).not.toHaveBeenCalled();
    });

    it.each([
      ["la cuenta ya no es válida", accountInvalid],
      ["el cobro no existe", resourceMissing],
    ])("16 días y %s (error permanente): 409 para resolverlo con soporte y el intento sigue abierto", async (_label, error) => {
      const store = fakeStore(longProcessing(16));
      const gateway = fakeGateway();
      gateway.retrievePayment.mockRejectedValue(error());

      await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).rejects.toMatchObject({
        code: "AUTOMATIC_COLLECTION_NEEDS_SUPPORT",
        status: 409,
        message:
          "No se puede comprobar en Stripe el cobro de esta cuota. Resuélvelo en Stripe con su soporte; no se puede marcar como revisado.",
      });
      expect(gateway.retrievePayment).toHaveBeenCalledWith({ connectedAccount, paymentIntentId });
      expect(gateway.cancelPayment).not.toHaveBeenCalled();
      expect(store.applyOutcome).not.toHaveBeenCalled();
      expect(store.closeAttempt).not.toHaveBeenCalled();
    });

    it("16 días y Stripe falla de forma pasajera: 503 para reintentar y no se cierra", async () => {
      const store = fakeStore(longProcessing(16));
      const gateway = fakeGateway();
      gateway.retrievePayment.mockRejectedValue(networkError());

      await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).rejects.toMatchObject({
        code: "AUTOMATIC_COLLECTION_UNVERIFIED",
        status: 503,
      });
      expect(store.closeAttempt).not.toHaveBeenCalled();
    });

    it("16 días y Stripe dice que sigue en el banco: 409 y no se cierra", async () => {
      const store = fakeStore(longProcessing(16));
      const gateway = fakeGateway({ [paymentIntentId]: "processing" });

      await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).rejects.toMatchObject({
        code: "AUTOMATIC_COLLECTION_PROCESSING",
      });
      expect(gateway.cancelPayment).not.toHaveBeenCalled();
      expect(store.closeAttempt).not.toHaveBeenCalled();
    });

    it("16 días y el cobro ya salió: se registra y nunca se cierra", async () => {
      const store = fakeStore(longProcessing(16));
      const gateway = fakeGateway({ [paymentIntentId]: "succeeded" });

      await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).resolves.toEqual({
        outcome: "collected",
      });
      expect(store.closeAttempt).not.toHaveBeenCalled();
    });

    it("cancelar en Stripe con error permanente tras leerlo: 409 para soporte y no se cierra", async () => {
      const store = fakeStore(attempt({ hasReviewNotice: true }));
      const gateway = fakeGateway();
      gateway.cancelPayment.mockRejectedValue(accountInvalid());

      await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).rejects.toMatchObject({
        code: "AUTOMATIC_COLLECTION_NEEDS_SUPPORT",
        status: 409,
      });
      expect(store.closeAttempt).not.toHaveBeenCalled();
    });

    it("la búsqueda de cobros con error permanente: 409 para soporte; con varios cobros, también al releer uno", async () => {
      const searching = fakeStore(attempt({ status: "claimed", paymentIntentId: null, hasReviewNotice: true }));
      const searchGateway = fakeGateway();
      searchGateway.listPaymentsByAttempt.mockRejectedValue(accountInvalid());
      await expect(
        markAutomaticCollectionReviewed(reviewInput, { store: searching, gateway: searchGateway })
      ).rejects.toMatchObject({ code: "AUTOMATIC_COLLECTION_NEEDS_SUPPORT", status: 409 });
      expect(searching.closeAttempt).not.toHaveBeenCalled();

      const many = fakeStore(attempt({ status: "claimed", paymentIntentId: null, hasReviewNotice: true }));
      const manyGateway = fakeGateway();
      manyGateway.listPaymentsByAttempt.mockResolvedValue([
        { id: "pi_SyntheticAcademyMany1", status: "canceled", lastErrorCode: null, lastDeclineCode: null },
        { id: "pi_SyntheticAcademyMany2", status: "canceled", lastErrorCode: null, lastDeclineCode: null },
      ]);
      manyGateway.retrievePayment.mockRejectedValue(resourceMissing());
      await expect(markAutomaticCollectionReviewed(reviewInput, { store: many, gateway: manyGateway })).rejects.toMatchObject({
        code: "AUTOMATIC_COLLECTION_NEEDS_SUPPORT",
        status: 409,
      });
      expect(many.closeAttempt).not.toHaveBeenCalled();
    });

    it("cancelar el cobro automático no cambia: con error permanente sigue siendo 503", async () => {
      const store = fakeStore(attempt());
      const gateway = fakeGateway();
      gateway.retrievePayment.mockRejectedValue(accountInvalid());

      await expect(cancelAutomaticCollection(cancelInput, { store, gateway })).rejects.toMatchObject({
        code: "AUTOMATIC_COLLECTION_UNVERIFIED",
        status: 503,
      });
      expect(store.closeAttempt).not.toHaveBeenCalled();
    });
  });

  it("con aviso: cancela el cobro sin terminar en Stripe y lo cierra como reviewed_by_academy", async () => {
    const store = fakeStore(attempt({ hasReviewNotice: true }));
    const gateway = fakeGateway();

    await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).resolves.toEqual({
      outcome: "reviewed",
    });

    expect(gateway.cancelPayment).toHaveBeenCalledWith({ connectedAccount, paymentIntentId });
    expect(store.closeAttempt).toHaveBeenCalledWith({
      organizationId,
      attemptId,
      expected: { status: "created", paymentIntentId },
      reason: "reviewed_by_academy",
      actor: { userId, memberId },
      now,
    });
  });

  const intent = (id: string, status: string) => ({ id, status, lastErrorCode: null, lastDeclineCode: null });

  it("reanudaciones agotadas sin cobro guardado: lo busca en Stripe y, si no hay, lo cierra", async () => {
    const store = fakeStore(attempt({ status: "claimed", paymentIntentId: null, resumeCount: 3 }));
    const gateway = fakeGateway();

    await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).resolves.toEqual({
      outcome: "reviewed",
    });
    expect(gateway.listPaymentsByAttempt).toHaveBeenCalledWith({ connectedAccount, attemptId });
    expect(gateway.cancelPayment).not.toHaveBeenCalled();
    expect(store.closeAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ expected: { status: "claimed", paymentIntentId: null } })
    );
  });

  it("un cobro encontrado en Stripe que sí salió se registra y no se cierra", async () => {
    const found = "pi_SyntheticAcademyFound";
    const store = fakeStore(attempt({ status: "claimed", paymentIntentId: null, hasReviewNotice: true }));
    const gateway = fakeGateway({ [found]: "succeeded" });
    gateway.listPaymentsByAttempt.mockResolvedValue([intent(found, "succeeded")]);

    await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).resolves.toEqual({
      outcome: "collected",
    });
    expect(store.applyOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: { kind: "succeeded", paymentIntentId: found, received } })
    );
    expect(store.closeAttempt).not.toHaveBeenCalled();
  });

  it.each(["succeeded", "processing"])(
    "varios cobros y uno está %s: 409 para resolverlo en Stripe con su soporte; nada se cancela ni se cierra",
    async (moved) => {
      const first = "pi_SyntheticAcademyMany1";
      const second = "pi_SyntheticAcademyMany2";
      const store = fakeStore(attempt({ status: "claimed", paymentIntentId: null, hasReviewNotice: true }));
      // La búsqueda puede ir atrasada: lo que cuenta es la relectura de cada cobro.
      const gateway = fakeGateway({ [first]: "requires_confirmation", [second]: moved });
      gateway.listPaymentsByAttempt.mockResolvedValue([
        intent(first, "requires_confirmation"),
        intent(second, "requires_confirmation"),
      ]);

      await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).rejects.toMatchObject({
        code: "AUTOMATIC_COLLECTION_NEEDS_SUPPORT",
        status: 409,
        message:
          "Hay varios cobros en Stripe para esta cuota y al menos uno se ha cobrado o está en curso. Resuélvelo en Stripe con su soporte; no se puede marcar como revisado.",
      });
      expect(gateway.retrievePayment).toHaveBeenCalledWith({ connectedAccount, paymentIntentId: first });
      expect(gateway.retrievePayment).toHaveBeenCalledWith({ connectedAccount, paymentIntentId: second });
      expect(gateway.cancelPayment).not.toHaveBeenCalled();
      expect(store.applyOutcome).not.toHaveBeenCalled();
      expect(store.closeAttempt).not.toHaveBeenCalled();
    }
  );

  it("varios cobros y ninguno movió dinero: cancela los abiertos y lo cierra", async () => {
    const open = "pi_SyntheticAcademyOpen";
    const canceled = "pi_SyntheticAcademyCanceled";
    const store = fakeStore(attempt({ status: "claimed", paymentIntentId: null, hasReviewNotice: true }));
    const gateway = fakeGateway({ [open]: "requires_payment_method", [canceled]: "canceled" });
    gateway.listPaymentsByAttempt.mockResolvedValue([intent(open, "requires_payment_method"), intent(canceled, "canceled")]);

    await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).resolves.toEqual({
      outcome: "reviewed",
    });
    expect(gateway.cancelPayment).toHaveBeenCalledTimes(1);
    expect(gateway.cancelPayment).toHaveBeenCalledWith({ connectedAccount, paymentIntentId: open });
    expect(store.closeAttempt).toHaveBeenCalledWith(expect.objectContaining({ reason: "reviewed_by_academy" }));
  });

  it("varios cobros: si uno no se puede releer, 503 y no se cierra", async () => {
    const store = fakeStore(attempt({ status: "claimed", paymentIntentId: null, hasReviewNotice: true }));
    const gateway = fakeGateway();
    gateway.listPaymentsByAttempt.mockResolvedValue([
      intent("pi_SyntheticAcademyMany1", "canceled"),
      intent("pi_SyntheticAcademyMany2", "canceled"),
    ]);
    gateway.retrievePayment.mockRejectedValue(new Error("network"));

    await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).rejects.toMatchObject({
      code: "AUTOMATIC_COLLECTION_UNVERIFIED",
    });
    expect(store.closeAttempt).not.toHaveBeenCalled();
  });

  it("si la búsqueda en Stripe falla de forma pasajera, 503 y no se cierra", async () => {
    const store = fakeStore(attempt({ status: "claimed", paymentIntentId: null, hasReviewNotice: true }));
    const gateway = fakeGateway();
    gateway.listPaymentsByAttempt.mockRejectedValue(
      Object.assign(new Error("connection reset"), { type: "StripeConnectionError" })
    );

    await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).rejects.toMatchObject({
      code: "AUTOMATIC_COLLECTION_UNVERIFIED",
      status: 503,
    });
    expect(store.closeAttempt).not.toHaveBeenCalled();
  });

  it("demasiados cobros en Stripe para el intento (siempre igual): 409 para soporte y no se cierra", async () => {
    const store = fakeStore(attempt({ status: "claimed", paymentIntentId: null, hasReviewNotice: true }));
    const gateway = fakeGateway();
    gateway.listPaymentsByAttempt.mockRejectedValue(new Error("FAMILY_COLLECTION_TOO_MANY_PAYMENTS_FOR_ATTEMPT"));

    await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).rejects.toMatchObject({
      code: "AUTOMATIC_COLLECTION_NEEDS_SUPPORT",
      status: 409,
      message:
        "Hay demasiados cobros en Stripe para esta cuota. Resuélvelo en Stripe con su soporte; no se puede marcar como revisado.",
    });
    expect(gateway.retrievePayment).not.toHaveBeenCalled();
    expect(store.closeAttempt).not.toHaveBeenCalled();
  });

  it("cobrado con otro importe: marcar como revisado responde 409 para soporte y nunca cierra", async () => {
    const store = fakeStore(attempt({ hasReviewNotice: true }), {
      applyOutcome: vi.fn<AcademyCollectionStore["applyOutcome"]>(async () => ({
        applied: false as const,
        review: "amount_mismatch",
      })),
    });
    const gateway = fakeGateway({ [paymentIntentId]: "succeeded" }, "canceled", 4000);

    await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).rejects.toMatchObject({
      code: "AUTOMATIC_COLLECTION_NEEDS_SUPPORT",
      status: 409,
    });
    expect(gateway.cancelPayment).not.toHaveBeenCalled();
    expect(store.closeAttempt).not.toHaveBeenCalled();
  });

  it("cobrado pero ya registrado para otro intento: el dinero está en el libro; se cierra", async () => {
    const store = fakeStore(attempt({ hasReviewNotice: true }), {
      applyOutcome: vi.fn(async () => ({ applied: false as const, review: "payment_recorded_for_other_attempt" })),
    });
    const gateway = fakeGateway({ [paymentIntentId]: "succeeded" });

    await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).resolves.toEqual({
      outcome: "reviewed",
    });
    expect(gateway.cancelPayment).not.toHaveBeenCalled();
    expect(store.closeAttempt).toHaveBeenCalled();
  });

  it("en curso en el banco: 409 y no se cierra", async () => {
    const store = fakeStore(attempt({ status: "processing", hasReviewNotice: true }));
    const gateway = fakeGateway({ [paymentIntentId]: "processing" });
    await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).rejects.toMatchObject({
      code: "AUTOMATIC_COLLECTION_PROCESSING",
    });
    expect(store.closeAttempt).not.toHaveBeenCalled();
  });

  it("con un cobro guardado que no se puede leer (sin datos de Stripe), 409 y no se cierra", async () => {
    const store = fakeStore(attempt({ hasReviewNotice: true }), { loadAttemptRefs: vi.fn(async () => null) });
    const gateway = fakeGateway();
    await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).rejects.toMatchObject({
      code: "AUTOMATIC_COLLECTION_NEEDS_SUPPORT",
      status: 409,
      message:
        "No se puede comprobar en Stripe el cobro de esta cuota. Resuélvelo en Stripe con su soporte; no se puede marcar como revisado.",
    });
    expect(gateway.retrievePayment).not.toHaveBeenCalled();
    expect(store.closeAttempt).not.toHaveBeenCalled();
  });

  it("sin cobro guardado ni datos de Stripe (nunca pudo crearse), la confirmación basta para cerrarlo", async () => {
    const store = fakeStore(attempt({ status: "claimed", paymentIntentId: null, hasReviewNotice: true }), {
      loadAttemptRefs: vi.fn(async () => null),
    });
    const gateway = fakeGateway();
    await expect(markAutomaticCollectionReviewed(reviewInput, { store, gateway })).resolves.toEqual({
      outcome: "reviewed",
    });
    expect(gateway.listPaymentsByAttempt).not.toHaveBeenCalled();
    expect(store.closeAttempt).toHaveBeenCalledWith(expect.objectContaining({ reason: "reviewed_by_academy" }));
  });
});

describe("listCollectionPaymentsByAttempt", () => {
  const attemptUuid = attemptId;

  function stripeWith(result: { data: unknown[]; has_more: boolean }) {
    const search = vi.fn(async () => result);
    return { stripe: { paymentIntents: { search } } as unknown as Stripe, search };
  }

  it("busca por el id del intento en la cuenta de la academia y devuelve solo los suyos", async () => {
    const { stripe, search } = stripeWith({
      has_more: false,
      data: [
        { id: "pi_SyntheticList1", status: "succeeded", metadata: { zaltyko_collection_attempt_id: attemptUuid } },
        { id: "pi_SyntheticList2", status: "canceled", metadata: { zaltyko_collection_attempt_id: attemptUuid } },
        { id: "pi_SyntheticOther", status: "succeeded", metadata: { zaltyko_collection_attempt_id: "otro" } },
      ],
    });

    const found = await listCollectionPaymentsByAttempt({ connectedAccount, attemptId: attemptUuid }, stripe);

    expect(found.map((payment) => [payment.id, payment.status])).toEqual([
      ["pi_SyntheticList1", "succeeded"],
      ["pi_SyntheticList2", "canceled"],
    ]);
    expect(search).toHaveBeenCalledWith(
      { query: `metadata['zaltyko_collection_attempt_id']:'${attemptUuid}'`, limit: 100 },
      { stripeAccount: connectedAccount }
    );
  });

  it("si Stripe tiene más de una página, lanza: no se revisa lo que no se ha visto entero", async () => {
    const { stripe } = stripeWith({ has_more: true, data: [] });
    await expect(listCollectionPaymentsByAttempt({ connectedAccount, attemptId: attemptUuid }, stripe)).rejects.toThrow(
      "FAMILY_COLLECTION_TOO_MANY_PAYMENTS_FOR_ATTEMPT"
    );
  });
});

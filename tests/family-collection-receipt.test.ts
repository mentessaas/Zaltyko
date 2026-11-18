import { readFileSync } from "node:fs";

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobro automático de cuotas (Fase 4, Tarea 9), decisión D6 de Elvis («Sí,
 * apagado hasta abogado»): justificante de pago para la familia, por correo y
 * en una página imprimible, «no es factura», sin numeración, detrás de
 * ZALTYKO_FAMILY_COLLECTION_RECEIPTS_ENABLED. Bandera, textos exactos, envío
 * (una sola vez, sin datos personales en lo que se guarda o se registra),
 * página y enlace del portal. Lo que toca la base de verdad (evento en el
 * outbox, una sola vez; página solo para la persona que paga) está en
 * family-collection-worker-pg.test.ts. Nunca envía un correo de verdad ni lee
 * la base: el emisor y la base están simulados. Fechas fijas: no depende del reloj.
 */

const env = vi.hoisted(() => ({
  environment: "test" as "test" | "live" | null,
  production: false,
}));
const mocks = vi.hoisted(() => ({
  sendEmailWithLogging: vi.fn(),
  error: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  resolveAccess: vi.fn(),
  requireFamilyUser: vi.fn(),
  /** Si se indica, sustituye a findFamilyReceipt (página con la bandera encendida). */
  findReceipt: null as null | ((input: { userId: string; attemptId: string }) => Promise<unknown>),
}));

vi.mock("@/db", () => ({ db: { execute: mocks.execute, transaction: mocks.transaction } }));
vi.mock("@/lib/env", () => ({ getAppUrl: () => "https://app.zaltyko.test" }));
vi.mock("@/lib/email/email-service", () => ({ sendEmailWithLogging: mocks.sendEmailWithLogging }));
vi.mock("@/lib/logger", () => ({
  logger: { error: mocks.error, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/modules/family-collection/application/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/family-collection/application/config")>()),
  resolveConnectEnvironment: () => env.environment,
  isProductionDatabase: () => env.production,
}));
vi.mock("@/modules/family-portal/application/family-portal-access", () => ({
  resolveFamilyPortalAccess: mocks.resolveAccess,
}));
vi.mock("@/modules/family-collection/application/family-receipt-reads", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/family-collection/application/family-receipt-reads")>();
  return {
    ...original,
    findFamilyReceipt: (input: { userId: string; attemptId: string }) =>
      mocks.findReceipt ? mocks.findReceipt(input) : original.findFamilyReceipt(input),
  };
});
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" });
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/familia/cuotas",
}));
vi.mock("@/app/familia/_lib/family-user", () => ({ requireFamilyUser: mocks.requireFamilyUser }));
vi.mock("@/components/family-portal/FamilyPortalShell", () => ({
  FamilyPortalShell: ({ children }: { children: ReactNode }) => children,
}));
// FamilyFeesView importa la tarjeta de pago automático: Stripe.js no se carga.
vi.mock("@stripe/stripe-js/pure", () => ({ loadStripe: vi.fn() }));
vi.mock("@stripe/stripe-js", () => ({ loadStripe: vi.fn() }));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: ReactNode }) => children,
  PaymentElement: () => null,
  useStripe: () => null,
  useElements: () => null,
}));

import FamilyReceiptPage from "@/app/familia/cuotas/justificante/[attemptId]/page";
import { FamilyFeesView } from "@/components/family-portal/FamilyFeesView";
import {
  FAMILY_COLLECTION_RECEIPTS_FLAG_ENV,
  isFamilyCollectionReceiptsFlagEnabled,
} from "@/modules/family-collection/application/config";
import { deliverFamilyReceipts } from "@/modules/family-collection/application/family-receipt-delivery";
import {
  findFamilyReceipt,
  getFamilyReceipt,
  getFamilyReceiptLinks,
} from "@/modules/family-collection/application/family-receipt-reads";
import {
  FAMILY_RECEIPT_EVENT,
  FAMILY_RECEIPT_RESULT_EVENT,
  familyReceiptKey,
  familyReceiptPath,
  familyReceiptStatusLines,
  renderFamilyReceipt,
  type FamilyReceiptView,
} from "@/modules/family-collection/domain/family-receipt";
import type {
  FamilyReceiptStore,
  PendingFamilyReceipt,
} from "@/modules/family-collection/infrastructure/family-receipt-store";
import type { FamilyAcademyFees } from "@/modules/family-portal/application/family-portal-reads";

const NOW = new Date("2026-11-18T10:00:00.000Z");
const ORGANIZATION_ID = "93000000-0000-4000-8000-000000000001";
const LOCATION_ID = "93000000-0000-4000-8000-000000000002";
const ATTEMPT_ID = "93000000-0000-4000-8000-000000000003";
const INVOICE_ID = "93000000-0000-4000-8000-000000000004";
const USER_ID = "93000000-0000-4000-8000-000000000005";
const OTHER_USER_ID = "93000000-0000-4000-8000-000000000006";
const PAYER_EMAIL = "familia.sintetica@example.invalid";

const VIEW: FamilyReceiptView = {
  academyName: "Club Sintético",
  payerName: "Ana Prueba",
  fees: [
    { label: "Cuota de febrero de 2027", athleteName: "Lucía", amountCents: 2500 },
    { label: "Cuota de febrero de 2027", athleteName: "Pablo", amountCents: 2000 },
  ],
  totalCents: 4500,
  currency: "EUR",
  collectedOnLocal: "2027-02-05",
  method: "card",
  reference: "MENSUAL-2027-02-17",
};

function pending(overrides: Partial<PendingFamilyReceipt> = {}): PendingFamilyReceipt {
  return {
    organizationId: ORGANIZATION_ID,
    locationId: LOCATION_ID,
    attemptId: ATTEMPT_ID,
    invoiceId: INVOICE_ID,
    organizationStatus: "active",
    payerEmail: PAYER_EMAIL,
    replyToEmail: "secretaria@example.invalid",
    occurredAt: "2026-11-18T06:00:00.000000Z",
    ...overrides,
  };
}

function fakeStore(receipts: PendingFamilyReceipt[], view: FamilyReceiptView | null = VIEW) {
  return {
    listPending: vi.fn<FamilyReceiptStore["listPending"]>(async () => receipts),
    readReceipt: vi.fn<FamilyReceiptStore["readReceipt"]>(async () => view),
    recordResult: vi.fn<FamilyReceiptStore["recordResult"]>(async () => true),
  };
}

const PHASE4 = async () => "phase4" as const;

function pageParams(attemptId: string) {
  return { params: Promise.resolve({ attemptId }) };
}

async function expectNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ digest: "NEXT_NOT_FOUND" });
}

const academy: FamilyAcademyFees = {
  organizationId: ORGANIZATION_ID,
  organizationName: "Club Sintético",
  timezone: "Europe/Madrid",
  fees: [
    {
      invoiceId: INVOICE_ID,
      reference: "CUO-A",
      status: "paid",
      currency: "EUR",
      totalCents: 4500,
      paidCents: 4500,
      refundedCents: 0,
      pendingCents: 0,
      dueAt: "2026-11-20T22:59:59.999Z",
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  env.environment = "test";
  env.production = false;
  mocks.findReceipt = null;
  mocks.sendEmailWithLogging.mockResolvedValue(true);
  mocks.requireFamilyUser.mockResolvedValue({ id: USER_ID });
  // La base nunca se toca en estos tests.
  mocks.execute.mockRejectedValue(new Error("la base no debe leerse"));
  mocks.transaction.mockRejectedValue(new Error("la base no debe leerse"));
  mocks.resolveAccess.mockRejectedValue(new Error("el acceso no debe resolverse"));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("bandera de justificantes", () => {
  it("bandera de justificantes apagada → cobro registrado sin evento de justificante, ningún correo, página 404 y sin enlace en el portal", async () => {
    vi.stubEnv(FAMILY_COLLECTION_RECEIPTS_FLAG_ENV, "");
    expect(isFamilyCollectionReceiptsFlagEnabled()).toBe(false);

    // Ningún correo: ceros sin leer la base ni la forma del almacenamiento.
    const store = fakeStore([pending()]);
    const storageShape = vi.fn(PHASE4);
    expect(await deliverFamilyReceipts({ now: NOW }, { store, sendEmail: mocks.sendEmailWithLogging, storageShape })).toEqual({
      sent: 0,
      notSent: 0,
      pending: 0,
    });
    expect(storageShape).not.toHaveBeenCalled();
    expect(store.listPending).not.toHaveBeenCalled();
    expect(mocks.sendEmailWithLogging).not.toHaveBeenCalled();

    // Página 404 sin pedir sesión ni leer la base.
    await expectNotFound(FamilyReceiptPage(pageParams(ATTEMPT_ID)));
    expect(mocks.requireFamilyUser).not.toHaveBeenCalled();
    expect(await findFamilyReceipt({ userId: USER_ID, attemptId: ATTEMPT_ID })).toBeNull();
    expect(
      await getFamilyReceipt({ userId: USER_ID, organizationId: ORGANIZATION_ID, attemptId: ATTEMPT_ID })
    ).toBeNull();

    // Sin enlace en el portal.
    expect(await getFamilyReceiptLinks({ userId: USER_ID, invoiceIds: [INVOICE_ID] })).toEqual({});
    const html = renderToStaticMarkup(createElement(FamilyFeesView, { academies: [academy], receiptLinks: {} }));
    expect(html).not.toContain("Ver justificante");
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.resolveAccess).not.toHaveBeenCalled();
    // (El cobro registrado sin evento de justificante, en PostgreSQL:
    // family-collection-worker-pg.test.ts, «Tarea 9: bandera … apagada».)
  });

  it('bandera con otro valor que "true" ("1", "TRUE") → apagada', async () => {
    for (const value of ["1", "TRUE", "True", " true", "yes", ""]) {
      vi.stubEnv(FAMILY_COLLECTION_RECEIPTS_FLAG_ENV, value);
      expect(isFamilyCollectionReceiptsFlagEnabled(), value).toBe(false);
      const store = fakeStore([pending()]);
      expect(await deliverFamilyReceipts({ now: NOW }, { store, storageShape: PHASE4 })).toEqual({
        sent: 0,
        notSent: 0,
        pending: 0,
      });
      expect(store.listPending).not.toHaveBeenCalled();
      await expectNotFound(FamilyReceiptPage(pageParams(ATTEMPT_ID)));
    }
    vi.stubEnv(FAMILY_COLLECTION_RECEIPTS_FLAG_ENV, "true");
    expect(isFamilyCollectionReceiptsFlagEnabled()).toBe(true);
  });

  it("encendida pero con la clave que no es de test o contra la base de producción: nada", async () => {
    vi.stubEnv(FAMILY_COLLECTION_RECEIPTS_FLAG_ENV, "true");
    for (const [environment, production] of [
      ["live", false],
      [null, false],
      ["test", true],
    ] as const) {
      env.environment = environment;
      env.production = production;
      const store = fakeStore([pending()]);
      expect(await deliverFamilyReceipts({ now: NOW }, { store, storageShape: PHASE4 })).toEqual({
        sent: 0,
        notSent: 0,
        pending: 0,
      });
      expect(store.listPending).not.toHaveBeenCalled();
      expect(await getFamilyReceiptLinks({ userId: USER_ID, invoiceIds: [INVOICE_ID] })).toEqual({});
      expect(await findFamilyReceipt({ userId: USER_ID, attemptId: ATTEMPT_ID })).toBeNull();
    }
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("claves del outbox: un justificante y un resultado por intento", () => {
    expect(FAMILY_RECEIPT_EVENT).toBe("family_collection.receipt");
    expect(FAMILY_RECEIPT_RESULT_EVENT).toBe("family_collection.receipt_result");
    expect(familyReceiptKey(ATTEMPT_ID)).toBe(`family-collection:${ATTEMPT_ID}:receipt`);
    expect(familyReceiptPath(ATTEMPT_ID)).toBe(`/familia/cuotas/justificante/${ATTEMPT_ID}`);
  });
});

describe("renderFamilyReceipt", () => {
  const receiptUrl = `https://app.zaltyko.test/familia/cuotas/justificante/${ATTEMPT_ID}`;

  it("renderFamilyReceipt: texto exacto «no es una factura» y sin datos de tarjeta", () => {
    const message = renderFamilyReceipt({ ...VIEW, receiptUrl });
    expect(message.subject).toBe("Justificante de pago de Club Sintético");
    const notInvoice = "Este justificante no es una factura. Si necesitas factura, pídesela a Club Sintético.";
    expect(message.text).toContain(notInvoice);
    expect(message.html).toContain(notInvoice);
    expect(message.text).toBe(
      [
        "Hola, Ana Prueba:",
        "Club Sintético ha recibido tu pago. Aquí tienes el justificante.",
        [
          "Academia: Club Sintético",
          "Pagado por: Ana Prueba",
          "Fecha del cobro: 5 de febrero de 2027",
          "Forma de pago: Tarjeta",
          "Referencia de la cuota: MENSUAL-2027-02-17",
        ].join("\n"),
        ["Cuota de febrero de 2027 · Lucía: 25,00 €", "Cuota de febrero de 2027 · Pablo: 20,00 €", "Total pagado: 45,00 €"]
          .join("\n")
          .replace(/ €/g, " €"),
        `Ver o imprimir el justificante: ${receiptUrl}`,
        notInvoice,
      ].join("\n\n")
    );
    expect(message.html).toContain(`<a href="${receiptUrl}">Ver o imprimir el justificante</a>`);
    // Sin números de tarjeta ni de cuenta, sin numeración propia y sin jerga.
    for (const body of [message.text, message.html].map((value) => value.replaceAll(receiptUrl, ""))) {
      expect(body).not.toMatch(/\d{4}\s?\d{4}|\*{2,}|IBAN|ES\d{2}|últimos dígitos|n\.º|número de justificante/i);
      expect(body).not.toMatch(/stripe|pi_|payment ?intent|webhook|3DS|SCA|connect/i);
    }
  });

  it("domiciliación, sin gimnasta ni nombre de quien paga y con caracteres especiales escapados", () => {
    const message = renderFamilyReceipt({
      ...VIEW,
      academyName: "Club <Sintético> & Cía",
      payerName: "  ",
      method: "sepa_debit",
      fees: [{ label: "Cuota de marzo de 2027", athleteName: null, amountCents: 4500 }],
      receiptUrl,
    });
    expect(message.subject).toBe("Justificante de pago de Club <Sintético> & Cía");
    expect(message.text.startsWith("Hola:\n\n")).toBe(true);
    expect(message.text).not.toContain("Pagado por");
    expect(message.text).toContain("Forma de pago: Domiciliación bancaria");
    expect(message.text).toContain("Cuota de marzo de 2027: 45,00");
    expect(message.html).toContain("Club &lt;Sintético&gt; &amp; Cía");
    expect(message.html).not.toContain("<Sintético>");
  });
});

describe("deliverFamilyReceipts (bandera encendida)", () => {
  beforeEach(() => {
    vi.stubEnv(FAMILY_COLLECTION_RECEIPTS_FLAG_ENV, "true");
  });

  it("envía el justificante a la persona que paga, con una clave por intento, y deja el resultado; solo ids en lo que se guarda", async () => {
    const store = fakeStore([pending()]);
    const result = await deliverFamilyReceipts(
      { now: NOW },
      { store, sendEmail: mocks.sendEmailWithLogging, storageShape: PHASE4 }
    );
    expect(result).toEqual({ sent: 1, notSent: 0, pending: 0 });
    expect(store.listPending).toHaveBeenCalledWith({
      since: new Date("2026-11-11T10:00:00.000Z"),
      limit: 50,
      scope: null,
      after: null,
    });
    expect(store.readReceipt).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID, attemptId: ATTEMPT_ID, now: NOW });
    expect(mocks.sendEmailWithLogging).toHaveBeenCalledTimes(1);
    const [email] = mocks.sendEmailWithLogging.mock.calls[0] as [Record<string, unknown>];
    expect(email).toMatchObject({
      purpose: "transactional",
      to: PAYER_EMAIL,
      replyTo: "secretaria@example.invalid",
      subject: "Justificante de pago de Club Sintético",
      template: "family_collection_receipt",
      tenantId: ORGANIZATION_ID,
      metadata: { kind: "family_collection_receipt", attemptId: ATTEMPT_ID, invoiceId: INVOICE_ID },
      dedupeKey: `family-collection:${ATTEMPT_ID}:receipt`,
    });
    expect(String(email.text)).toContain(`https://app.zaltyko.test/familia/cuotas/justificante/${ATTEMPT_ID}`);
    expect(JSON.stringify(email.metadata)).not.toMatch(/example\.invalid|Ana|Lucía|4500/);
    expect(store.recordResult).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      locationId: LOCATION_ID,
      attemptId: ATTEMPT_ID,
      invoiceId: INVOICE_ID,
      outcome: "sent",
      now: NOW,
    });
  });

  it("sin correo de la persona pagadora → notSent y la página sigue disponible", async () => {
    const store = fakeStore([pending({ payerEmail: null })]);
    expect(
      await deliverFamilyReceipts({ now: NOW }, { store, sendEmail: mocks.sendEmailWithLogging, storageShape: PHASE4 })
    ).toEqual({ sent: 0, notSent: 1, pending: 0 });
    expect(mocks.sendEmailWithLogging).not.toHaveBeenCalled();
    expect(store.recordResult).toHaveBeenCalledWith(expect.objectContaining({ outcome: "no_email" }));

    // La página no depende del correo: la persona que paga la sigue viendo.
    const finder = vi.fn(async () => VIEW);
    mocks.findReceipt = finder;
    const html = renderToStaticMarkup(await FamilyReceiptPage(pageParams(ATTEMPT_ID)));
    expect(finder).toHaveBeenCalledWith({ userId: USER_ID, attemptId: ATTEMPT_ID });
    expect(html).toContain("Justificante de pago");
    expect(html).toContain("Este justificante no es una factura. Si necesitas factura, pídesela a Club Sintético.");
    expect(html).toContain("Cuota de febrero de 2027 · Lucía");
    expect(html).toContain("Tarjeta");
    expect(html).toContain("Imprimir o guardar como PDF");
    expect(html).not.toContain(ATTEMPT_ID);
  });

  it("academia suspendida, cobro que ya no se puede leer o envío no aceptado: no enviado, una vez", async () => {
    const cases: Array<[PendingFamilyReceipt, FamilyReceiptView | null, boolean, string]> = [
      [pending({ organizationStatus: "suspended" }), VIEW, true, "organization_inactive"],
      [pending(), null, true, "superseded"],
      [pending(), VIEW, false, "not_delivered"],
    ];
    for (const [receipt, view, accepted, outcome] of cases) {
      vi.clearAllMocks();
      mocks.sendEmailWithLogging.mockResolvedValue(accepted);
      const store = fakeStore([receipt], view);
      expect(
        await deliverFamilyReceipts({ now: NOW }, { store, sendEmail: mocks.sendEmailWithLogging, storageShape: PHASE4 })
      ).toEqual({ sent: 0, notSent: 1, pending: 0 });
      expect(store.recordResult).toHaveBeenCalledWith(expect.objectContaining({ outcome }));
    }
  });

  it("si el emisor falla: no entregado (no se reintenta); si falla la lectura del libro: pendiente para otro día; en el registro solo ids", async () => {
    mocks.sendEmailWithLogging.mockRejectedValue(new Error(`proveedor rechazó ${PAYER_EMAIL}`));
    const failing = fakeStore([pending()]);
    expect(
      await deliverFamilyReceipts({ now: NOW }, { store: failing, sendEmail: mocks.sendEmailWithLogging, storageShape: PHASE4 })
    ).toEqual({ sent: 0, notSent: 1, pending: 0 });
    expect(failing.recordResult).toHaveBeenCalledWith(expect.objectContaining({ outcome: "not_delivered" }));

    const unreadable = fakeStore([pending()]);
    unreadable.readReceipt.mockRejectedValue(new Error("detalle interno de la base"));
    expect(
      await deliverFamilyReceipts({ now: NOW }, { store: unreadable, sendEmail: mocks.sendEmailWithLogging, storageShape: PHASE4 })
    ).toEqual({ sent: 0, notSent: 0, pending: 1 });
    expect(unreadable.recordResult).not.toHaveBeenCalled();

    const logged = JSON.stringify(mocks.error.mock.calls);
    expect(logged).not.toMatch(/example\.invalid|detalle interno|Ana Prueba/);
    expect(mocks.error).toHaveBeenCalledWith(
      "Cobro automático: no se pudo enviar el justificante de pago a la familia",
      undefined,
      { organizationId: ORGANIZATION_ID, invoiceId: INVOICE_ID, attemptId: ATTEMPT_ID, errorName: "Error", stage: "read" }
    );
    expect(mocks.error).toHaveBeenCalledWith(
      "Cobro automático: no se pudo enviar el justificante de pago a la familia",
      undefined,
      { organizationId: ORGANIZATION_ID, invoiceId: INVOICE_ID, attemptId: ATTEMPT_ID, errorName: "Error", stage: "send" }
    );
  });

  it("Tarea M (punto 15): si falla la preparación del correo antes de enviar → no entregado, sin reintentar 7 días", async () => {
    // Una vista que el correo no sabe preparar (cuotas ilegibles): renderFamilyReceipt lanza.
    const broken = { ...VIEW, fees: null as unknown as FamilyReceiptView["fees"] };
    const store = fakeStore([pending()], broken);
    expect(
      await deliverFamilyReceipts({ now: NOW }, { store, sendEmail: mocks.sendEmailWithLogging, storageShape: PHASE4 })
    ).toEqual({ sent: 0, notSent: 1, pending: 0 });
    expect(mocks.sendEmailWithLogging).not.toHaveBeenCalled();
    expect(store.recordResult).toHaveBeenCalledWith(expect.objectContaining({ outcome: "not_delivered" }));
    expect(mocks.error).toHaveBeenCalledWith(
      "Cobro automático: no se pudo enviar el justificante de pago a la familia",
      undefined,
      { organizationId: ORGANIZATION_ID, invoiceId: INVOICE_ID, attemptId: ATTEMPT_ID, errorName: "TypeError", stage: "prepare" }
    );
  });

  it("si no se puede guardar el resultado: pendiente (el emisor no lo reenvía por su clave)", async () => {
    const store = fakeStore([pending()]);
    store.recordResult.mockRejectedValue(new Error("base caída"));
    expect(
      await deliverFamilyReceipts({ now: NOW }, { store, sendEmail: mocks.sendEmailWithLogging, storageShape: PHASE4 })
    ).toEqual({ sent: 0, notSent: 0, pending: 1 });
  });

  it("sin las tablas del cobro, nada", async () => {
    const store = fakeStore([pending()]);
    expect(
      await deliverFamilyReceipts({ now: NOW }, { store, storageShape: async () => "none" as const })
    ).toEqual({ sent: 0, notSent: 0, pending: 0 });
    expect(store.listPending).not.toHaveBeenCalled();
  });

  it("de página en página hasta acabar, sin repetir", async () => {
    const second = "93000000-0000-4000-8000-000000000013";
    const store = fakeStore([]);
    store.listPending
      .mockResolvedValueOnce([pending()])
      .mockResolvedValueOnce([pending({ attemptId: second, occurredAt: "2026-11-18T06:00:01.000000Z" })]);
    expect(
      await deliverFamilyReceipts(
        { now: NOW, limit: 1 },
        { store, sendEmail: mocks.sendEmailWithLogging, storageShape: PHASE4 }
      )
    ).toEqual({ sent: 2, notSent: 0, pending: 0 });
    expect(store.listPending).toHaveBeenNthCalledWith(2, expect.objectContaining({
      after: { occurredAt: "2026-11-18T06:00:00.000000Z", attemptId: ATTEMPT_ID },
    }));
    expect(store.listPending).toHaveBeenCalledTimes(3);
  });
});

describe("página del justificante y enlace del portal (bandera encendida)", () => {
  beforeEach(() => {
    vi.stubEnv(FAMILY_COLLECTION_RECEIPTS_FLAG_ENV, "true");
  });

  it("la página solo la ve la persona pagadora; otra cuenta → 404", async () => {
    const finder = vi.fn(async (input: { userId: string }) => (input.userId === USER_ID ? VIEW : null));
    mocks.findReceipt = finder;
    expect(renderToStaticMarkup(await FamilyReceiptPage(pageParams(ATTEMPT_ID)))).toContain("Total pagado");

    mocks.requireFamilyUser.mockResolvedValue({ id: OTHER_USER_ID });
    await expectNotFound(FamilyReceiptPage(pageParams(ATTEMPT_ID)));
    expect(finder).toHaveBeenLastCalledWith({ userId: OTHER_USER_ID, attemptId: ATTEMPT_ID });

    // Un id que no es un uuid: 404 sin buscar nada.
    finder.mockClear();
    await expectNotFound(FamilyReceiptPage(pageParams("../otro")));
    expect(finder).not.toHaveBeenCalled();
  });

  it("Tarea M (punto 13): cobro devuelto o en revisión con el banco → una línea sencilla, sin ocultar el justificante", async () => {
    mocks.findReceipt = vi.fn(async () => ({ ...VIEW, refundedOnLocal: "2027-02-10" }));
    const refunded = renderToStaticMarkup(await FamilyReceiptPage(pageParams(ATTEMPT_ID)));
    expect(refunded).toContain("Este pago se devolvió el 10 de febrero de 2027.");
    expect(refunded).toContain("Total pagado");
    expect(refunded).not.toContain("en revisión con el banco");

    mocks.findReceipt = vi.fn(async () => ({ ...VIEW, underBankReview: true }));
    const disputed = renderToStaticMarkup(await FamilyReceiptPage(pageParams(ATTEMPT_ID)));
    expect(disputed).toContain("Este pago está en revisión con el banco.");
    expect(disputed).toContain("Total pagado");

    // Sin nada que contar, ninguna de las dos.
    mocks.findReceipt = vi.fn(async () => ({ ...VIEW, refundedOnLocal: null, underBankReview: false }));
    const plain = renderToStaticMarkup(await FamilyReceiptPage(pageParams(ATTEMPT_ID)));
    expect(plain).not.toContain("Este pago se devolvió");
    expect(plain).not.toContain("en revisión con el banco");
    expect(familyReceiptStatusLines({ refundedOnLocal: "2027-02-10", underBankReview: true })).toEqual([
      "Este pago se devolvió el 10 de febrero de 2027.",
      "Este pago está en revisión con el banco.",
    ]);
  });

  it("Tarea M (punto 14): al imprimir, la cabecera y la navegación del portal no salen", () => {
    const shell = readFileSync("src/components/family-portal/FamilyPortalShell.tsx", "utf8");
    const header = /<header className="([^"]*)"/.exec(shell);
    expect(header?.[1].split(/\s+/)).toContain("print:hidden");
    // La navegación va dentro de esa cabecera.
    expect(shell.indexOf('aria-label="Portal de familias"')).toBeGreaterThan(shell.indexOf("<header"));
    expect(shell.indexOf('aria-label="Portal de familias"')).toBeLessThan(shell.indexOf("</header>"));
  });

  it("el portal enseña «Ver justificante» solo en las cuotas con enlace", () => {
    const html = renderToStaticMarkup(
      createElement(FamilyFeesView, { academies: [academy], receiptLinks: { [INVOICE_ID]: ATTEMPT_ID } })
    );
    expect(html).toContain("Ver justificante");
    expect(html).toContain(`href="/familia/cuotas/justificante/${ATTEMPT_ID}"`);
    expect(renderToStaticMarkup(createElement(FamilyFeesView, { academies: [academy] }))).not.toContain(
      "Ver justificante"
    );
  });
});

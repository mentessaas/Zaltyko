import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobro automático de cuotas (Fase 3), decisión D3 de Elvis (17-11-2026):
 * aviso a la familia cuando falla el primer cobro de una cuota. Textos
 * exactos, cuándo se avisa (solo un fallo de verdad del intento 1), el enlace
 * a /familia/cuotas y el envío (una sola vez, sin datos personales en lo que
 * se guarda). Nunca envía un correo de verdad: el emisor está simulado.
 * Fechas fijas: no depende del reloj.
 */

const env = vi.hoisted(() => ({
  environment: "test" as "test" | "live" | null,
  production: false,
  /** ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED: sin ella no salen reintentos. */
  flag: true,
}));
const mocks = vi.hoisted(() => ({
  sendEmailWithLogging: vi.fn(),
  error: vi.fn(),
  createStore: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/env", () => ({ getAppUrl: () => "https://app.zaltyko.test" }));
vi.mock("@/lib/email/email-service", () => ({ sendEmailWithLogging: mocks.sendEmailWithLogging }));
vi.mock("@/lib/logger", () => ({
  logger: { error: mocks.error, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/modules/family-collection/application/config", () => ({
  isFamilyAutomaticCollectionFlagEnabled: () => env.flag,
  resolveConnectEnvironment: () => env.environment,
  isProductionDatabase: () => env.production,
}));
vi.mock("@/modules/family-collection/application/storage", () => ({
  isFamilyCollectionStorageAvailable: vi.fn(async () => true),
}));
vi.mock("@/modules/family-collection/infrastructure/family-failure-notice-store", () => ({
  createFamilyFailureNoticeStore: mocks.createStore,
}));

import type { SendEmailOptions } from "@/lib/email/email-service";
import {
  FAMILY_FAILURE_NOTICE_BATCH,
  FAMILY_FAILURE_NOTICE_MAX_AGE_MS,
  decideFamilyFailureNotice,
  deliverFamilyFailureNotices,
  retryKnownBlocked,
} from "@/modules/family-collection/application/family-failure-notice-delivery";
import {
  FAMILY_FAILURE_NOTICE,
  FAMILY_FAILURE_NOTICE_EVENT,
  FAMILY_FAILURE_NOTICE_RESULT_EVENT,
  FAMILY_FEES_PATH,
  NOT_CONFIRMED_FAILURE_CODE,
  PAYMENT_METHOD_MISSING_CODE,
  feeLabel,
  familyFailureNoticeKey,
  familyFailureNoticeKind,
  familyFailureNoticeResultKey,
  familyNoticeApplies,
  notifiesFamilyOnCancel,
  notifiesFamilyOnFailure,
  renderFamilyFailureNotice,
  retryDayLabel,
  type FamilyFailureNoticeKind,
} from "@/modules/family-collection/domain/family-failure-notice";
import type {
  FamilyFailureNoticeOutcome,
  FamilyFailureNoticeStore,
  PendingFamilyFailureNotice,
} from "@/modules/family-collection/infrastructure/family-failure-notice-store";

const ORGANIZATION_ID = "94000000-0000-4000-8000-000000000001";
const LOCATION_ID = "94000000-0000-4000-8000-000000000002";
const ATTEMPT_ID = "94000000-0000-4000-8000-000000000003";
const INVOICE_ID = "94000000-0000-4000-8000-000000000004";
const NOW = new Date("2026-11-17T09:00:00.000Z");
const FEES_URL = "https://zaltyko.test/familia/cuotas";
/** Correo sintético de la persona que paga. */
const PAYER_EMAIL = "tutora.sintetica@example.invalid";
const ALL_KINDS: FamilyFailureNoticeKind[] = [
  "retry_scheduled",
  "authentication_required",
  "card_declined",
  "sepa_failed",
  "card_missing",
  "payment_method_missing",
  "not_collected",
];

function pending(overrides: Partial<PendingFamilyFailureNotice> = {}): PendingFamilyFailureNotice {
  return {
    organizationId: ORGANIZATION_ID,
    locationId: LOCATION_ID,
    attemptId: ATTEMPT_ID,
    invoiceId: INVOICE_ID,
    attemptNumber: 1,
    attemptStatus: "failed",
    paymentMethodKind: "card",
    failureCode: "card_declined",
    declineCode: "insufficient_funds",
    // 00:00 del 18-11 en Madrid: el reintento del día +1.
    nextRetryAt: new Date("2026-11-17T23:00:00.000Z"),
    lastAttemptNumber: 1,
    invoiceStatus: "issued",
    organizationStatus: "active",
    academyName: "Club Sintético",
    timezone: "Europe/Madrid",
    servicePeriodStart: "2026-11-01",
    payerEmail: PAYER_EMAIL,
    replyToEmail: null,
    ...overrides,
  };
}

/**
 * Almacén en memoria con la misma regla que el de verdad: un aviso con
 * resultado ya no sale como pendiente y el resultado se guarda una sola vez.
 */
function memoryStore(notices: PendingFamilyFailureNotice[]) {
  const results = new Map<string, FamilyFailureNoticeOutcome>();
  const store = {
    listPending: vi.fn<FamilyFailureNoticeStore["listPending"]>(async () =>
      notices.filter((notice) => !results.has(notice.attemptId))
    ),
    recordResult: vi.fn<FamilyFailureNoticeStore["recordResult"]>(async (input) => {
      if (results.has(input.attemptId)) return false;
      results.set(input.attemptId, input.outcome);
      return true;
    }),
  };
  return { store, results };
}

function sender(accepted = true) {
  return vi.fn<(options: SendEmailOptions) => Promise<boolean>>(async () => accepted);
}

beforeEach(() => {
  vi.clearAllMocks();
  env.environment = "test";
  env.production = false;
  env.flag = true;
});

// ---------------------------------------------------------------------------
// Dominio
// ---------------------------------------------------------------------------

describe("aviso del primer fallo: claves y cuándo se avisa", () => {
  it("una clave por intento, con el nombre del evento del outbox", () => {
    expect(FAMILY_FAILURE_NOTICE).toBe("family_failure_notice");
    expect(FAMILY_FAILURE_NOTICE_EVENT).toBe("family_collection.family_failure_notice");
    expect(FAMILY_FAILURE_NOTICE_RESULT_EVENT).toBe("family_collection.family_failure_notice_result");
    expect(familyFailureNoticeKey(ATTEMPT_ID)).toBe(`family-collection:${ATTEMPT_ID}:family_failure_notice`);
    expect(familyFailureNoticeResultKey(ATTEMPT_ID)).toBe(
      `family-collection:${ATTEMPT_ID}:family_failure_notice_result`
    );
    expect(FAMILY_FEES_PATH).toBe("/familia/cuotas");
  });

  it("solo un fallo de verdad del intento 1: nunca en los reintentos", () => {
    for (const code of ["card_declined", "authentication_required", "payment_failed", "expired_card"]) {
      expect(notifiesFamilyOnFailure({ attemptNumber: 1, failureCode: code })).toBe(true);
    }
    for (const attemptNumber of [2, 3, 4, 5, 0]) {
      expect(notifiesFamilyOnFailure({ attemptNumber, failureCode: "card_declined" })).toBe(false);
    }
  });

  it("la tarjeta ya no está en Stripe (resource_missing al crear): solo el cierre del intento 1 avisa", () => {
    expect(PAYMENT_METHOD_MISSING_CODE).toBe("resource_missing");
    expect(notifiesFamilyOnCancel({ attemptNumber: 1, reason: "resource_missing" })).toBe(true);
    for (const attemptNumber of [2, 3, 4, 5]) {
      expect(notifiesFamilyOnCancel({ attemptNumber, reason: "resource_missing" })).toBe(false);
    }
    // Los demás cierres (la puerta, la academia, la ventana de cobro…) nunca avisan.
    for (const reason of [
      "sepa_not_enabled",
      "reminder_sent",
      "amount_below_minimum",
      "amount_too_small",
      "account_invalid",
      "authorization_inactive",
      "collection_window_expired",
      "canceled_by_academy",
      "reviewed_by_academy",
      // C1: cerrado por la academia sin saber si se cobró; C3: cancelado en Stripe
      // sin error de pago; C4: petición rechazada al crear.
      "reviewed_unverifiable",
      "canceled_in_stripe",
      "invalid_request",
      "parameter_invalid_integer",
    ]) {
      expect(notifiesFamilyOnCancel({ attemptNumber: 1, reason }), reason).toBe(false);
    }
    // Según cómo quedó el intento.
    expect(familyNoticeApplies({ attemptNumber: 1, status: "canceled", failureCode: "resource_missing" })).toBe(true);
    expect(familyNoticeApplies({ attemptNumber: 1, status: "canceled", failureCode: "card_declined" })).toBe(false);
    expect(familyNoticeApplies({ attemptNumber: 1, status: "failed", failureCode: "card_declined" })).toBe(true);
    expect(familyNoticeApplies({ attemptNumber: 1, status: "failed", failureCode: "transient_exhausted" })).toBe(false);
    expect(familyNoticeApplies({ attemptNumber: 1, status: "processing", failureCode: null })).toBe(false);
    expect(familyNoticeApplies({ attemptNumber: 2, status: "canceled", failureCode: "resource_missing" })).toBe(false);
  });

  it("un intento agotado sin saber nada de Stripe no es un rechazo del banco: no avisa", () => {
    expect(NOT_CONFIRMED_FAILURE_CODE).toBe("transient_exhausted");
    expect(notifiesFamilyOnFailure({ attemptNumber: 1, failureCode: "transient_exhausted" })).toBe(false);
  });

  it("qué se cuenta según el fallo y la política de reintentos", () => {
    const kind = (input: Partial<Parameters<typeof familyFailureNoticeKind>[0]>) =>
      familyFailureNoticeKind({
        paymentMethodKind: "card",
        failureCode: "card_declined",
        declineCode: "insufficient_funds",
        retryScheduled: true,
        ...input,
      });
    expect(kind({})).toBe("retry_scheduled");
    expect(kind({ declineCode: "stolen_card", retryScheduled: false })).toBe("card_declined");
    expect(kind({ failureCode: "expired_card", declineCode: null, retryScheduled: false })).toBe("card_declined");
    // 3DS: con el código, con el decline_code o con el estado `requires_action`.
    expect(kind({ failureCode: "authentication_required", declineCode: null, retryScheduled: false })).toBe(
      "authentication_required"
    );
    expect(kind({ failureCode: "card_declined", declineCode: "authentication_required", retryScheduled: false })).toBe(
      "authentication_required"
    );
    expect(kind({ failureCode: "requires_action", declineCode: null, retryScheduled: false })).toBe(
      "authentication_required"
    );
    // Domiciliación: nunca hay reintentos, aunque el dato dijera otra cosa.
    expect(kind({ paymentMethodKind: "sepa_debit", retryScheduled: true })).toBe("sepa_failed");
    expect(kind({ paymentMethodKind: null })).toBe("not_collected");
    expect(kind({ failureCode: "transient_exhausted", declineCode: null, retryScheduled: false })).toBe(
      "not_collected"
    );
    // La tarjeta (o la forma de pago) ya no está en Stripe: volver a guardarla.
    expect(kind({ failureCode: "resource_missing", declineCode: null, retryScheduled: false })).toBe("card_missing");
    expect(kind({ paymentMethodKind: "sepa_debit", failureCode: "resource_missing", declineCode: null })).toBe(
      "payment_method_missing"
    );
    expect(kind({ paymentMethodKind: null, failureCode: "resource_missing", declineCode: null })).toBe(
      "payment_method_missing"
    );
  });

  it("mes de la cuota y día del reintento en palabras", () => {
    expect(feeLabel("2026-11-01")).toBe("la cuota de noviembre de 2026");
    expect(feeLabel("2027-01-01")).toBe("la cuota de enero de 2027");
    expect(feeLabel(null)).toBe("tu cuota");
    expect(feeLabel("2026-13-01")).toBe("tu cuota");
    expect(retryDayLabel("2026-11-18")).toBe("18 de noviembre");
    expect(retryDayLabel("2026-12-01")).toBe("1 de diciembre");
    expect(retryDayLabel(null)).toBeNull();
    expect(retryDayLabel("mañana")).toBeNull();
  });
});

describe("aviso del primer fallo: textos", () => {
  const render = (kind: FamilyFailureNoticeKind, overrides: Partial<Parameters<typeof renderFamilyFailureNotice>[0]> = {}) =>
    renderFamilyFailureNotice({
      kind,
      academyName: "Club Sintético",
      servicePeriodStart: "2026-11-01",
      retryDateLocal: "2026-11-18",
      feesUrl: FEES_URL,
      ...overrides,
    });

  it("rechazo recuperable con reintento: la fecha del reintento salvo que cambie la tarjeta", () => {
    const message = render("retry_scheduled");
    expect(message.subject).toBe("Club Sintético: no hemos podido cobrar la cuota de noviembre de 2026");
    expect(message.text).toBe(
      [
        "Hola:",
        "No hemos podido cobrar con tu tarjeta la cuota de noviembre de 2026. El banco no lo ha aceptado esta vez.",
        "Volveremos a intentarlo el 18 de noviembre con la tarjeta que tengas guardada. Si quieres usar otra, cámbiala antes en Zaltyko.",
        `Revisar mi tarjeta: ${FEES_URL}`,
        "Si tienes cualquier duda, habla con Club Sintético.",
      ].join("\n\n")
    );
  });

  it("el banco pide confirmar el pago: no se promete ningún reintento y la cuota pasa a mano", () => {
    const message = render("authentication_required");
    expect(message.text).toBe(
      [
        "Hola:",
        "No hemos podido cobrar con tu tarjeta la cuota de noviembre de 2026: tu banco pide que confirmes tú el pago, y eso no se puede hacer de forma automática.",
        "Esta cuota ya no se cobrará sola. Tu academia te dirá cómo pagarla.",
        "En Zaltyko puedes ver tus cuotas y revisar tu tarjeta.",
        `Ver mis cuotas: ${FEES_URL}`,
        "Si tienes cualquier duda, habla con Club Sintético.",
      ].join("\n\n")
    );
  });

  it("tarjeta rechazada sin reintento: revisar la tarjeta para las próximas", () => {
    expect(render("card_declined").text).toBe(
      [
        "Hola:",
        "No hemos podido cobrar con tu tarjeta la cuota de noviembre de 2026. El banco no lo ha aceptado.",
        "Esta cuota ya no se cobrará sola. Tu academia te dirá cómo pagarla.",
        "Para que las próximas cuotas se cobren bien, revisa tu tarjeta en Zaltyko.",
        `Revisar mi tarjeta: ${FEES_URL}`,
        "Si tienes cualquier duda, habla con Club Sintético.",
      ].join("\n\n")
    );
  });

  it("domiciliación: nunca habla de reintentos", () => {
    expect(render("sepa_failed").text).toBe(
      [
        "Hola:",
        "No hemos podido cobrar por domiciliación la cuota de noviembre de 2026. El banco no lo ha aceptado.",
        "Esta cuota ya no se cobrará sola. Tu academia te dirá cómo pagarla.",
        "Para que las próximas cuotas se cobren bien, revisa tu forma de pago en Zaltyko.",
        `Revisar mi forma de pago: ${FEES_URL}`,
        "Si tienes cualquier duda, habla con Club Sintético.",
      ].join("\n\n")
    );
  });

  it("la tarjeta ya no está: volver a guardarla, sin reintento", () => {
    expect(render("card_missing").text).toBe(
      [
        "Hola:",
        "No hemos podido cobrar con tu tarjeta la cuota de noviembre de 2026: la tarjeta que tenías guardada ya no está disponible.",
        "Esta cuota ya no se cobrará sola. Tu academia te dirá cómo pagarla.",
        "Para que las próximas cuotas se cobren solas, vuelve a guardar tu tarjeta en Zaltyko.",
        `Actualizar mi tarjeta: ${FEES_URL}`,
        "Si tienes cualquier duda, habla con Club Sintético.",
      ].join("\n\n")
    );
    expect(render("payment_method_missing").text).toBe(
      [
        "Hola:",
        "No hemos podido cobrar la cuota de noviembre de 2026: la forma de pago que tenías guardada ya no está disponible.",
        "Esta cuota ya no se cobrará sola. Tu academia te dirá cómo pagarla.",
        "Para que las próximas cuotas se cobren solas, vuelve a guardar tu forma de pago en Zaltyko.",
        `Actualizar mi forma de pago: ${FEES_URL}`,
        "Si tienes cualquier duda, habla con Club Sintético.",
      ].join("\n\n")
    );
  });

  it("solo el aviso con reintento programado promete volver a intentarlo", () => {
    for (const kind of ALL_KINDS) {
      const { text, html } = render(kind);
      const promises = /volveremos a intentarlo|reintent/i;
      expect(promises.test(text), kind).toBe(kind === "retry_scheduled");
      expect(promises.test(html), kind).toBe(kind === "retry_scheduled");
    }
  });

  it("un solo enlace, a /familia/cuotas, y nunca el cobro de Stripe ni jerga", () => {
    for (const kind of ALL_KINDS) {
      const { subject, text, html } = render(kind);
      expect(text.match(/https?:\/\//g), kind).toHaveLength(1);
      expect(text).toContain(FEES_URL);
      expect(html.match(/href="/g), kind).toHaveLength(1);
      expect(html).toContain(`href="${FEES_URL}"`);
      for (const value of [subject, text, html]) {
        expect(value).not.toMatch(/pi_|payment ?intent|stripe|off-session|webhook|connect\b|3ds|decline/i);
      }
    }
  });

  it("sin mes legible ni fecha de reintento no inventa nada, y escapa el nombre en el HTML", () => {
    const message = render("retry_scheduled", {
      academyName: "Club <b>Sintético</b>",
      servicePeriodStart: null,
      retryDateLocal: null,
    });
    expect(message.subject).toBe("Club <b>Sintético</b>: no hemos podido cobrar tu cuota");
    expect(message.text).toContain("No hemos podido cobrar con tu tarjeta tu cuota.");
    expect(message.text).toContain(
      "Volveremos a intentarlo pronto con la tarjeta que tengas guardada. Si quieres usar otra, cámbiala cuanto antes en Zaltyko."
    );
    expect(message.html).toContain("Club &lt;b&gt;Sintético&lt;/b&gt;");
    expect(message.html).not.toContain("<b>");
  });
});

// ---------------------------------------------------------------------------
// Decisión y envío
// ---------------------------------------------------------------------------

describe("aviso del primer fallo: qué se hace con un aviso pendiente", () => {
  const ON = { retriesEnabled: true };
  const OFF = { retriesEnabled: false };
  /** 00:00 en Madrid del día local indicado de noviembre de 2026 (UTC+1). */
  const retryOn = (day: number) => new Date(Date.UTC(2026, 10, day - 1, 23, 0, 0));

  it("se envía con la fecha local del reintento", () => {
    expect(decideFamilyFailureNotice(pending(), NOW, ON)).toEqual({
      action: "send",
      retryScheduled: true,
      retryDateLocal: "2026-11-18",
    });
    expect(decideFamilyFailureNotice(pending({ nextRetryAt: null }), NOW, ON)).toEqual({
      action: "send",
      retryScheduled: false,
      retryDateLocal: null,
    });
  });

  it("una academia en prueba es operativa: el aviso se envía igual que con una activa (17-11-2026)", () => {
    expect(decideFamilyFailureNotice(pending({ organizationStatus: "trial" }), NOW, ON)).toEqual({
      action: "send",
      retryScheduled: true,
      retryDateLocal: "2026-11-18",
    });
  });

  it("cerrado porque la tarjeta ya no está en Stripe (intento 1): se envía, sin reintento", () => {
    expect(
      decideFamilyFailureNotice(
        pending({ attemptStatus: "canceled", failureCode: "resource_missing", declineCode: null, nextRetryAt: null }),
        NOW,
        ON
      )
    ).toEqual({ action: "send", retryScheduled: false, retryDateLocal: null });
  });

  it("I1: con el cobro automático apagado nunca se promete el reintento (no saldría)", () => {
    expect(decideFamilyFailureNotice(pending(), NOW, OFF)).toEqual({
      action: "send",
      retryScheduled: false,
      retryDateLocal: null,
    });
  });

  it("M2: un reintento de hoy o ya pasado nunca se promete con fecha; si su ventana pasó, sin promesa", () => {
    expect(retryOn(18).toISOString()).toBe("2026-11-17T23:00:00.000Z");
    const decide = (day: number) => decideFamilyFailureNotice(pending({ nextRetryAt: retryOn(day) }), NOW, ON);
    // Hoy (17-11) y días pasados dentro de la ventana de 3 días: «pronto», sin fecha.
    for (const day of [17, 16, 14]) {
      expect(decide(day), `día ${day}`).toEqual({ action: "send", retryScheduled: true, retryDateLocal: null });
    }
    // Ventana del reintento pasada (13-11 + 3 días < 17-11): ya no saldrá.
    expect(decide(13)).toEqual({ action: "send", retryScheduled: false, retryDateLocal: null });
  });

  it("B-M1: si la puerta ya sabe que cancelará el reintento, no se promete (recordatorio, familia a mano, sin método)", () => {
    const blockers: Array<Partial<PendingFamilyFailureNotice>> = [
      { reminderSent: true },
      { preferenceAutomatic: false },
      { hasActiveAuthorization: false },
    ];
    for (const blocker of blockers) {
      expect(retryKnownBlocked(pending(blocker)), JSON.stringify(blocker)).toBe(true);
      // Con fecha futura o ya en su día: nunca «Volveremos a intentarlo».
      for (const nextRetryAt of [new Date("2026-11-17T23:00:00.000Z"), new Date("2026-11-16T23:00:00.000Z")]) {
        expect(decideFamilyFailureNotice(pending({ ...blocker, nextRetryAt }), NOW, ON), JSON.stringify(blocker)).toEqual({
          action: "send",
          retryScheduled: false,
          retryDateLocal: null,
        });
      }
    }
    // Todo en pie (o sin saberlo): el reintento se promete como siempre.
    const clear = pending({ reminderSent: false, preferenceAutomatic: true, hasActiveAuthorization: true });
    expect(retryKnownBlocked(clear)).toBe(false);
    expect(retryKnownBlocked(pending())).toBe(false);
    expect(decideFamilyFailureNotice(clear, NOW, ON)).toEqual({
      action: "send",
      retryScheduled: true,
      retryDateLocal: "2026-11-18",
    });
  });

  it("nunca se envía un aviso que ya no es verdad", () => {
    const close = (overrides: Partial<PendingFamilyFailureNotice>) =>
      decideFamilyFailureNotice(pending(overrides), NOW, ON);
    expect(close({ organizationStatus: "suspended" })).toEqual({ action: "close", outcome: "organization_inactive" });
    expect(close({ organizationStatus: "closed" })).toEqual({ action: "close", outcome: "organization_inactive" });
    expect(close({ invoiceStatus: "paid" })).toEqual({ action: "close", outcome: "invoice_closed" });
    expect(close({ invoiceStatus: "void" })).toEqual({ action: "close", outcome: "invoice_closed" });
    // Un reintento posterior ya cobró la cuota, el intento no es el primero o no está fallido.
    expect(close({ lastAttemptNumber: 2, lastAttemptStatus: "succeeded" })).toEqual({
      action: "close",
      outcome: "superseded",
    });
    expect(close({ attemptNumber: 2, lastAttemptNumber: 2 })).toEqual({ action: "close", outcome: "superseded" });
    expect(close({ attemptStatus: "canceled" })).toEqual({ action: "close", outcome: "superseded" });
    expect(close({ attemptStatus: "canceled", failureCode: "sepa_not_enabled", declineCode: null, nextRetryAt: null })).toEqual({
      action: "close",
      outcome: "superseded",
    });
    expect(close({ failureCode: "transient_exhausted", nextRetryAt: null })).toEqual({
      action: "close",
      outcome: "superseded",
    });
    expect(close({ payerEmail: null })).toEqual({ action: "close", outcome: "no_email" });
  });

  it("C2: un reintento ya reclamado no anula el aviso del primer fallo: se envía sin fecha o con la del siguiente", () => {
    const decide = (overrides: Partial<PendingFamilyFailureNotice>, options = ON) =>
      decideFamilyFailureNotice(pending({ lastAttemptNumber: 2, ...overrides }), NOW, options);
    // El intento 2 está en curso (o no se sabe su estado): «pronto», sin fecha.
    for (const lastAttemptStatus of ["claimed", "created", "processing", undefined]) {
      expect(decide({ lastAttemptStatus }), String(lastAttemptStatus)).toEqual({
        action: "send",
        retryScheduled: true,
        retryDateLocal: null,
      });
    }
    // El intento 2 falló con otro reintento programado (20-11): la fecha de ese siguiente.
    expect(decide({ lastAttemptStatus: "failed", lastAttemptNextRetryAt: retryOn(20) })).toEqual({
      action: "send",
      retryScheduled: true,
      retryDateLocal: "2026-11-20",
    });
    // …ya en su día: sin fecha.
    expect(decide({ lastAttemptStatus: "failed", lastAttemptNextRetryAt: retryOn(17) })).toEqual({
      action: "send",
      retryScheduled: true,
      retryDateLocal: null,
    });
    // El intento 2 falló sin reintento o se canceló: sin promesa (ya no se cobrará sola).
    for (const overrides of [
      { lastAttemptStatus: "failed", lastAttemptNextRetryAt: null },
      { lastAttemptStatus: "canceled", lastAttemptNextRetryAt: null },
    ]) {
      expect(decide(overrides), overrides.lastAttemptStatus).toEqual({
        action: "send",
        retryScheduled: false,
        retryDateLocal: null,
      });
    }
    // Sin la bandera o con la puerta que ya sabe que lo cancelará, nunca se promete.
    expect(decide({ lastAttemptStatus: "created" }, OFF)).toEqual({
      action: "send",
      retryScheduled: false,
      retryDateLocal: null,
    });
    expect(decide({ lastAttemptStatus: "failed", lastAttemptNextRetryAt: retryOn(20), reminderSent: true })).toEqual({
      action: "send",
      retryScheduled: false,
      retryDateLocal: null,
    });
  });
});

describe("aviso del primer fallo: envío", () => {
  it("envía un correo a la persona que paga con el enlace a /familia/cuotas y guarda el resultado", async () => {
    const { store, results } = memoryStore([pending({ replyToEmail: "secretaria@example.invalid" })]);
    const sendEmail = sender();

    const delivery = await deliverFamilyFailureNotices({ now: NOW, appUrl: "https://zaltyko.test/" }, {
      store,
      sendEmail,
      isStorageAvailable: async () => true,
    });

    expect(delivery).toEqual({ sent: 1, notSent: 0, pending: 0 });
    expect(store.listPending).toHaveBeenCalledWith({
      since: new Date(NOW.getTime() - FAMILY_FAILURE_NOTICE_MAX_AGE_MS),
      limit: FAMILY_FAILURE_NOTICE_BATCH,
      scope: null,
      after: null,
      // Forma "phase3" (isStorageAvailable): sin avisos requires_action ni su plazo.
      authentication: false,
    });
    // Una página incompleta: no se pide otra.
    expect(store.listPending).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const options = sendEmail.mock.calls[0]![0];
    expect(options).toMatchObject({
      purpose: "transactional",
      to: PAYER_EMAIL,
      subject: "Club Sintético: no hemos podido cobrar la cuota de noviembre de 2026",
      replyTo: "secretaria@example.invalid",
      template: "family_collection_failure",
      tenantId: ORGANIZATION_ID,
      dedupeKey: `family-collection:${ATTEMPT_ID}:family_failure_notice`,
      metadata: { kind: "family_collection_failure", attemptId: ATTEMPT_ID, invoiceId: INVOICE_ID },
    });
    expect(options.text).toContain("Volveremos a intentarlo el 18 de noviembre");
    expect(options.text).toContain(`Revisar mi tarjeta: ${FEES_URL}`);
    expect(options.html).toContain(`href="${FEES_URL}"`);
    expect(store.recordResult).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      locationId: LOCATION_ID,
      attemptId: ATTEMPT_ID,
      invoiceId: INVOICE_ID,
      outcome: "sent",
      now: NOW,
    });
    expect(results.get(ATTEMPT_ID)).toBe("sent");
    // Lo que se guarda solo lleva ids y el código del resultado.
    expect(JSON.stringify(store.recordResult.mock.calls)).not.toContain(PAYER_EMAIL);
  });

  it("sin correo de respuesta de la academia no inventa uno y usa la dirección de la app por defecto", async () => {
    const { store } = memoryStore([pending()]);
    const sendEmail = sender();
    await deliverFamilyFailureNotices({ now: NOW }, { store, sendEmail, isStorageAvailable: async () => true });
    const options = sendEmail.mock.calls[0]![0];
    expect(options).not.toHaveProperty("replyTo");
    expect(options.text).toContain("https://app.zaltyko.test/familia/cuotas");
  });

  it("no se duplica: una segunda ejecución no vuelve a enviar el mismo aviso", async () => {
    const { store } = memoryStore([pending()]);
    const sendEmail = sender();
    const deps = { store, sendEmail, isStorageAvailable: async () => true };

    await deliverFamilyFailureNotices({ now: NOW, appUrl: "https://zaltyko.test" }, deps);
    const second = await deliverFamilyFailureNotices({ now: NOW, appUrl: "https://zaltyko.test" }, deps);

    expect(second).toEqual({ sent: 0, notSent: 0, pending: 0 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(store.recordResult).toHaveBeenCalledTimes(1);
  });

  it("3DS: el correo pide revisar en /familia/cuotas, sin reintento", async () => {
    const { store } = memoryStore([
      pending({ failureCode: "authentication_required", declineCode: "authentication_required", nextRetryAt: null }),
    ]);
    const sendEmail = sender();
    await deliverFamilyFailureNotices(
      { now: NOW, appUrl: "https://zaltyko.test" },
      { store, sendEmail, isStorageAvailable: async () => true }
    );
    const options = sendEmail.mock.calls[0]![0];
    expect(options.text).toContain("tu banco pide que confirmes tú el pago");
    expect(options.text).toContain(`Ver mis cuotas: ${FEES_URL}`);
    expect(options.text).not.toMatch(/volveremos a intentarlo/i);
  });

  it("domiciliación: nunca menciona reintentos", async () => {
    const { store } = memoryStore([
      pending({ paymentMethodKind: "sepa_debit", failureCode: "payment_failed", declineCode: "insufficient_funds", nextRetryAt: null }),
    ]);
    const sendEmail = sender();
    await deliverFamilyFailureNotices(
      { now: NOW, appUrl: "https://zaltyko.test" },
      { store, sendEmail, isStorageAvailable: async () => true }
    );
    const options = sendEmail.mock.calls[0]![0];
    expect(options.text).toContain("No hemos podido cobrar por domiciliación");
    expect(options.text).not.toMatch(/intentarlo|reintent/i);
  });

  it("los avisos que ya no valen se cierran sin correo", async () => {
    const notices = [
      pending({ attemptId: "94000000-0000-4000-8000-000000000011", payerEmail: null }),
      pending({ attemptId: "94000000-0000-4000-8000-000000000012", invoiceStatus: "paid" }),
      pending({ attemptId: "94000000-0000-4000-8000-000000000013", lastAttemptNumber: 2, lastAttemptStatus: "succeeded" }),
    ];
    const { store, results } = memoryStore(notices);
    const sendEmail = sender();

    const delivery = await deliverFamilyFailureNotices(
      { now: NOW, appUrl: "https://zaltyko.test" },
      { store, sendEmail, isStorageAvailable: async () => true }
    );

    expect(delivery).toEqual({ sent: 0, notSent: 3, pending: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
    expect([...results.values()]).toEqual(["no_email", "invoice_closed", "superseded"]);
  });

  it("un envío no aceptado queda como no entregado (la academia lo ve)", async () => {
    const { store, results } = memoryStore([pending()]);
    const delivery = await deliverFamilyFailureNotices(
      { now: NOW, appUrl: "https://zaltyko.test" },
      { store, sendEmail: sender(false), isStorageAvailable: async () => true }
    );
    expect(delivery).toEqual({ sent: 0, notSent: 1, pending: 0 });
    expect(results.get(ATTEMPT_ID)).toBe("not_delivered");
  });

  it("M1: si el envío lanza un error, queda como no entregado (la academia ve «Avísala tú») y el log solo lleva ids", async () => {
    const { store, results } = memoryStore([pending()]);
    const sendEmail = vi.fn<(options: SendEmailOptions) => Promise<boolean>>(async () => {
      throw new Error(`BREVO_API_ERROR: ${PAYER_EMAIL}`);
    });

    const delivery = await deliverFamilyFailureNotices(
      { now: NOW, appUrl: "https://zaltyko.test" },
      { store, sendEmail, isStorageAvailable: async () => true }
    );

    expect(delivery).toEqual({ sent: 0, notSent: 1, pending: 0 });
    expect(results.get(ATTEMPT_ID)).toBe("not_delivered");
    expect(mocks.error).toHaveBeenCalledWith(
      "Cobro automático: no se pudo enviar el aviso de cobro fallido a la familia",
      undefined,
      { organizationId: ORGANIZATION_ID, invoiceId: INVOICE_ID, attemptId: ATTEMPT_ID, errorName: "Error" }
    );
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain(PAYER_EMAIL);
  });

  it("si no se puede guardar el resultado, el aviso sigue pendiente y la siguiente ejecución lo vuelve a mirar", async () => {
    const { store } = memoryStore([pending()]);
    store.recordResult.mockRejectedValueOnce(Object.assign(new Error("base caída"), { code: "57P01" }));
    const sendEmail = sender();
    const deps = { store, sendEmail, isStorageAvailable: async () => true };

    expect(await deliverFamilyFailureNotices({ now: NOW, appUrl: "https://zaltyko.test" }, deps)).toEqual({
      sent: 0,
      notSent: 0,
      pending: 1,
    });
    expect(mocks.error).toHaveBeenCalledWith(
      "Cobro automático: no se pudo guardar el resultado del aviso a la familia",
      undefined,
      { organizationId: ORGANIZATION_ID, invoiceId: INVOICE_ID, attemptId: ATTEMPT_ID, errorName: "Error" }
    );
    // La siguiente ejecución lo vuelve a mirar (el emisor real no lo reenviaría: misma clave).
    expect(await deliverFamilyFailureNotices({ now: NOW, appUrl: "https://zaltyko.test" }, deps)).toEqual({
      sent: 1,
      notSent: 0,
      pending: 0,
    });
    expect(sendEmail.mock.calls.map(([options]) => options.dedupeKey)).toEqual([
      `family-collection:${ATTEMPT_ID}:family_failure_notice`,
      `family-collection:${ATTEMPT_ID}:family_failure_notice`,
    ]);
  });

  it("I1: con el cobro automático apagado el correo no promete el reintento", async () => {
    env.flag = false;
    const { store } = memoryStore([pending()]);
    const sendEmail = sender();
    const delivery = await deliverFamilyFailureNotices(
      { now: NOW, appUrl: "https://zaltyko.test" },
      { store, sendEmail, isStorageAvailable: async () => true }
    );
    expect(delivery).toEqual({ sent: 1, notSent: 0, pending: 0 });
    const options = sendEmail.mock.calls[0]![0];
    expect(options.text).not.toMatch(/volveremos a intentarlo|reintent/i);
    expect(options.text).toContain("Esta cuota ya no se cobrará sola. Tu academia te dirá cómo pagarla.");
    expect(options.text).toContain(`Revisar mi tarjeta: ${FEES_URL}`);
  });

  it("B-M1: con un recordatorio de pago ya enviado el correo no promete el reintento", async () => {
    const { store, results } = memoryStore([pending({ reminderSent: true })]);
    const sendEmail = sender();
    const delivery = await deliverFamilyFailureNotices(
      { now: NOW, appUrl: "https://zaltyko.test" },
      { store, sendEmail, isStorageAvailable: async () => true }
    );
    expect(delivery).toEqual({ sent: 1, notSent: 0, pending: 0 });
    const options = sendEmail.mock.calls[0]![0];
    expect(options.text).not.toMatch(/volveremos a intentarlo|reintent/i);
    expect(options.text).toContain("Esta cuota ya no se cobrará sola. Tu academia te dirá cómo pagarla.");
    expect(results.get(ATTEMPT_ID)).toBe("sent");
  });

  it("M2: con el reintento ya en su día, el correo lo promete sin fecha", async () => {
    // 00:00 del 17-11 en Madrid: hoy.
    const { store } = memoryStore([pending({ nextRetryAt: new Date("2026-11-16T23:00:00.000Z") })]);
    const sendEmail = sender();
    await deliverFamilyFailureNotices(
      { now: NOW, appUrl: "https://zaltyko.test" },
      { store, sendEmail, isStorageAvailable: async () => true }
    );
    const options = sendEmail.mock.calls[0]![0];
    expect(options.text).toContain("Volveremos a intentarlo pronto con la tarjeta que tengas guardada.");
    expect(options.text).not.toMatch(/intentarlo el \d/);
  });

  it("con la clave que no es de test, contra producción o sin tablas no hace nada", async () => {
    for (const [environment, production, storage] of [
      ["live", false, true],
      [null, false, true],
      ["test", true, true],
      ["test", false, false],
    ] as const) {
      env.environment = environment;
      env.production = production;
      const { store } = memoryStore([pending()]);
      const sendEmail = sender();
      const delivery = await deliverFamilyFailureNotices(
        { now: NOW, appUrl: "https://zaltyko.test" },
        { store, sendEmail, isStorageAvailable: async () => storage }
      );
      expect(delivery).toEqual({ sent: 0, notSent: 0, pending: 0 });
      expect(store.listPending).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    }
    expect(mocks.sendEmailWithLogging).not.toHaveBeenCalled();
    expect(mocks.createStore).not.toHaveBeenCalled();
  });

  it("C2: un reintento ya reclamado (intento 2 en curso) no deja a la familia sin aviso: se envía sin fecha", async () => {
    const { store, results } = memoryStore([pending({ lastAttemptNumber: 2, lastAttemptStatus: "created" })]);
    const sendEmail = sender();
    const delivery = await deliverFamilyFailureNotices(
      { now: NOW, appUrl: "https://zaltyko.test" },
      { store, sendEmail, isStorageAvailable: async () => true }
    );
    expect(delivery).toEqual({ sent: 1, notSent: 0, pending: 0 });
    expect(results.get(ATTEMPT_ID)).toBe("sent");
    const options = sendEmail.mock.calls[0]![0];
    expect(options.text).toContain("Volveremos a intentarlo pronto con la tarjeta que tengas guardada.");
    expect(options.text).not.toMatch(/intentarlo el \d/);
  });

  it("C2: con más avisos que una página, sigue de página en página hasta enviarlos todos", async () => {
    const total = FAMILY_FAILURE_NOTICE_BATCH * 2 + 7;
    // Instantes del aviso fijos y crecientes (el orden de la consulta real).
    const notices = Array.from({ length: total }, (_, index) =>
      pending({
        attemptId: `94000000-0000-4000-8000-${String(100000000000 + index)}`,
        invoiceId: `95000000-0000-4000-8000-${String(100000000000 + index)}`,
        occurredAt: new Date(Date.UTC(2026, 10, 16, 8, 0, index)).toISOString(),
      })
    );
    const results = new Map<string, FamilyFailureNoticeOutcome>();
    const store = {
      // Como la consulta real: sin resultado, después del cursor y como mucho `limit`.
      listPending: vi.fn<FamilyFailureNoticeStore["listPending"]>(async (input) => {
        const after = input.after ?? null;
        return notices
          .filter((notice) => !results.has(notice.attemptId))
          .filter(
            (notice) =>
              after === null ||
              notice.occurredAt! > after.occurredAt ||
              (notice.occurredAt === after.occurredAt && notice.attemptId > after.attemptId)
          )
          .slice(0, input.limit);
      }),
      recordResult: vi.fn<FamilyFailureNoticeStore["recordResult"]>(async (input) => {
        results.set(input.attemptId, input.outcome);
        return true;
      }),
    };
    const sendEmail = sender();

    const delivery = await deliverFamilyFailureNotices(
      { now: NOW, appUrl: "https://zaltyko.test" },
      { store, sendEmail, isStorageAvailable: async () => true }
    );

    expect(delivery).toEqual({ sent: total, notSent: 0, pending: 0 });
    expect(sendEmail).toHaveBeenCalledTimes(total);
    expect(new Set(sendEmail.mock.calls.map(([options]) => options.dedupeKey)).size).toBe(total);
    // Tres páginas: 50, 50 y 7 (la incompleta es la última).
    expect(store.listPending).toHaveBeenCalledTimes(3);
    expect(store.listPending.mock.calls[0]![0].after).toBeNull();
    expect(store.listPending.mock.calls[1]![0].after).toEqual({
      occurredAt: notices[FAMILY_FAILURE_NOTICE_BATCH - 1]!.occurredAt,
      attemptId: notices[FAMILY_FAILURE_NOTICE_BATCH - 1]!.attemptId,
    });
    expect(store.listPending.mock.calls[2]![0].after).toEqual({
      occurredAt: notices[FAMILY_FAILURE_NOTICE_BATCH * 2 - 1]!.occurredAt,
      attemptId: notices[FAMILY_FAILURE_NOTICE_BATCH * 2 - 1]!.attemptId,
    });
  });

  it("C2: una página que no avanza (o sin instante del aviso) no se repite en bucle", async () => {
    const full = Array.from({ length: FAMILY_FAILURE_NOTICE_BATCH }, (_, index) =>
      pending({ attemptId: `94000000-0000-4000-8000-${String(200000000000 + index)}` })
    );
    // Sin `occurredAt`: no se puede pedir la página siguiente sin repetir.
    const store = {
      listPending: vi.fn<FamilyFailureNoticeStore["listPending"]>(async () => full),
      recordResult: vi.fn<FamilyFailureNoticeStore["recordResult"]>(async () => true),
    };
    const delivery = await deliverFamilyFailureNotices(
      { now: NOW, appUrl: "https://zaltyko.test" },
      { store, sendEmail: sender(), isStorageAvailable: async () => true }
    );
    expect(delivery.sent).toBe(FAMILY_FAILURE_NOTICE_BATCH);
    expect(store.listPending).toHaveBeenCalledTimes(1);

    // Con instante, pero el almacén devuelve siempre la misma página: se para en la segunda.
    const stamped = full.map((notice) => ({ ...notice, occurredAt: "2026-11-16T08:00:00.000000Z" }));
    const stuck = {
      listPending: vi.fn<FamilyFailureNoticeStore["listPending"]>(async () => stamped),
      recordResult: vi.fn<FamilyFailureNoticeStore["recordResult"]>(async () => true),
    };
    await deliverFamilyFailureNotices(
      { now: NOW, appUrl: "https://zaltyko.test" },
      { store: stuck, sendEmail: sender(), isStorageAvailable: async () => true }
    );
    expect(stuck.listPending).toHaveBeenCalledTimes(2);
  });

  it("con el plazo agotado no envía nada más y lo deja para la siguiente ejecución", async () => {
    const { store } = memoryStore([pending()]);
    const sendEmail = sender();
    const delivery = await deliverFamilyFailureNotices(
      { now: NOW, appUrl: "https://zaltyko.test", deadlineMs: 0 },
      { store, sendEmail, isStorageAvailable: async () => true }
    );
    expect(delivery).toEqual({ sent: 0, notSent: 0, pending: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("Fase 4 (D7): aviso cuando el banco pide que la familia confirme el pago", () => {
  /** Fin del 5-3-2027 en Madrid. */
  const DEADLINE = new Date("2027-03-05T22:59:59.999Z");
  const BEFORE = new Date("2027-03-03T09:00:00.000Z");
  const waiting = (overrides: Partial<PendingFamilyFailureNotice> = {}) =>
    pending({
      attemptNumber: 3,
      lastAttemptNumber: 3,
      attemptStatus: "requires_action",
      lastAttemptStatus: "requires_action",
      failureCode: null,
      declineCode: null,
      nextRetryAt: null,
      servicePeriodStart: "2027-02-01",
      actionDeadlineAt: DEADLINE,
      ...overrides,
    });

  it("requires_action avisa en cualquier número de intento, solo antes del plazo", () => {
    for (const attemptNumber of [1, 2, 3, 4]) {
      expect(
        familyNoticeApplies({
          attemptNumber,
          status: "requires_action",
          failureCode: null,
          actionDeadlineAt: DEADLINE,
          now: BEFORE,
        }),
        String(attemptNumber)
      ).toBe(true);
    }
    expect(
      familyNoticeApplies({
        attemptNumber: 1,
        status: "requires_action",
        failureCode: null,
        actionDeadlineAt: DEADLINE,
        now: new Date(DEADLINE.getTime() + 1),
      })
    ).toBe(false);
    // Sin plazo conocido, nunca.
    expect(familyNoticeApplies({ attemptNumber: 1, status: "requires_action", failureCode: null, now: BEFORE })).toBe(false);
    expect(
      familyFailureNoticeKind({
        paymentMethodKind: "card",
        failureCode: null,
        declineCode: null,
        retryScheduled: false,
        attemptStatus: "requires_action",
      })
    ).toBe("authentication_required");
  });

  it("texto exacto con el plazo: confirmar el pago en Zaltyko antes del día", () => {
    const message = renderFamilyFailureNotice({
      kind: "authentication_required",
      academyName: "Club Sintético",
      servicePeriodStart: "2027-02-01",
      retryDateLocal: null,
      deadlineLocalDate: "2027-03-05",
      feesUrl: FEES_URL,
    });
    expect(message.subject).toBe("Club Sintético: confirma el pago de la cuota de febrero de 2027");
    expect(message.text).toBe(
      [
        "Hola:",
        "Tu banco pide que confirmes el pago de la cuota de febrero de 2027. Entra en Zaltyko y pulsa «Confirmar el pago» antes del 5 de marzo. Si no, tu academia te dirá cómo pagarla.",
        `Entrar en Zaltyko: ${FEES_URL}`,
        "Si tienes cualquier duda, habla con Club Sintético.",
      ].join("\n\n")
    );
    expect(message.text).not.toMatch(/volveremos a intentarlo|3DS|PaymentIntent|SCA/i);
  });

  it("aviso a la familia al entrar en requires_action, también en el intento 3, con el plazo", async () => {
    expect(decideFamilyFailureNotice(waiting(), BEFORE, { retriesEnabled: true })).toEqual({
      action: "send",
      retryScheduled: false,
      retryDateLocal: null,
      deadlineLocalDate: "2027-03-05",
    });

    const { store, results } = memoryStore([waiting()]);
    const sendEmail = sender();
    const delivery = await deliverFamilyFailureNotices(
      { now: BEFORE, appUrl: "https://zaltyko.test" },
      { store, sendEmail, storageShape: async () => "phase4" }
    );

    expect(delivery).toEqual({ sent: 1, notSent: 0, pending: 0 });
    // Con la forma phase4 se piden también los avisos requires_action y su plazo.
    expect(store.listPending.mock.calls[0]![0].authentication).toBe(true);
    const options = sendEmail.mock.calls[0]![0];
    expect(options.subject).toBe("Club Sintético: confirma el pago de la cuota de febrero de 2027");
    expect(options.text).toContain("pulsa «Confirmar el pago» antes del 5 de marzo");
    // Un solo correo por intento: la misma clave que el aviso de fallo.
    expect(options.dedupeKey).toBe(familyFailureNoticeKey(ATTEMPT_ID));
    expect(results.get(ATTEMPT_ID)).toBe("sent");
  });

  it("si el plazo ya pasó o el intento ya cambió, no se envía; el intento 1 que acabó failed avisa una vez, como siempre", () => {
    const decide = (overrides: Partial<PendingFamilyFailureNotice>, now = BEFORE) =>
      decideFamilyFailureNotice(waiting(overrides), now, { retriesEnabled: true });
    expect(decide({}, new Date(DEADLINE.getTime() + 1))).toEqual({ action: "close", outcome: "superseded" });
    expect(decide({ actionDeadlineAt: null })).toEqual({ action: "close", outcome: "superseded" });
    expect(decide({ attemptStatus: "succeeded", lastAttemptStatus: "succeeded" })).toEqual({
      action: "close",
      outcome: "superseded",
    });
    expect(decide({ payerEmail: null })).toEqual({ action: "close", outcome: "no_email" });
    // El intento 3 que caducó a failed: ya no es el primero, no se avisa otra vez.
    expect(decide({ attemptStatus: "failed", lastAttemptStatus: "failed", failureCode: "authentication_required" })).toEqual({
      action: "close",
      outcome: "superseded",
    });
    // El intento 1 que caducó antes de enviar su aviso: el aviso de la Fase 3, sin promesa.
    expect(
      decide({
        attemptNumber: 1,
        lastAttemptNumber: 1,
        attemptStatus: "failed",
        lastAttemptStatus: "failed",
        failureCode: "authentication_required",
      })
    ).toEqual({ action: "send", retryScheduled: false, retryDateLocal: null });
  });
});

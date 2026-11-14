import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  send: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("@/lib/email/email-service", () => ({ sendEmailWithLogging: mocks.send }));
vi.mock("@/lib/logger", () => ({
  logger: { info: mocks.info, warn: mocks.warn, error: mocks.error },
}));
vi.mock("@/lib/env", () => ({ getAppUrl: () => "https://staging.zaltyko.test" }));

import {
  buildSaasContractConfirmationEmail,
  SAAS_CONTRACT_CONFIRMATION_TEMPLATE,
  saasContractConfirmationDedupeKey,
  saasContractConfirmationFromPaidInvoice,
  sendSaasContractConfirmationEmail,
  type SaasContractConfirmation,
} from "@/modules/saas-billing/application/contract-confirmation-email";
import { IMMEDIATE_START_CONSENT_TEXT } from "@/modules/saas-billing/domain/immediate-start-consent";
import { SHORT_PAID_QA_ORGANIZATIONS } from "@/modules/saas-billing/application/short-paid-checkout-envelope";

const organizationId = "10000000-0000-4000-8000-000000000001";
const memberId = "20000000-0000-4000-8000-000000000002";
const seller = {
  legalName: "Titular de prueba",
  taxId: null,
  supportEmail: "hola@zaltyko.com",
};

/** Intl separa importe y símbolo con espacio duro (U+00A0). */
const plain = (value: string) => value.replace(/ /g, " ");

function confirmation(
  overrides: Partial<SaasContractConfirmation> = {}
): SaasContractConfirmation {
  return {
    environment: "test",
    organizationId,
    requestedByMemberId: memberId,
    planCode: "starter",
    billingInterval: "month",
    subscriptionReference: "sub_synthetic",
    invoiceReference: "in_synthetic",
    baseCents: 1900,
    taxCents: 399,
    totalCents: 2299,
    periodStartedAt: new Date("2026-11-14T10:00:00.000Z"),
    periodEndsAt: new Date("2026-12-14T10:00:00.000Z"),
    checkoutEmail: "facturacion@example.invalid",
    immediateStartConsentAccepted: true,
    ...overrides,
  };
}

function build(
  overrides: Partial<SaasContractConfirmation> = {},
  organizationName: string | null = "Club Gimnasia Sintético"
) {
  const content = buildSaasContractConfirmationEmail({
    confirmation: confirmation(overrides),
    organizationName,
    appUrl: "https://staging.zaltyko.test/",
    seller,
  });
  return { ...content, text: plain(content.text), html: plain(content.html) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockReset();
  mocks.send.mockReset();
});

describe("contenido del correo de confirmación de la contratación", () => {
  it("resume plan, periodicidad, base, IVA 21 %, total y fechas", () => {
    const { subject, text } = build();
    expect(subject).toBe(
      "[Modo prueba] Confirmación de tu contratación: Zaltyko Starter mensual"
    );
    expect(text).toContain(
      "Confirmamos la contratación del plan Starter de Zaltyko para Club Gimnasia Sintético, con pago mensual."
    );
    expect(text).toContain("- Plan: Starter (mensual)");
    expect(text).toContain("- Precio sin IVA: 19,00 €");
    expect(text).toContain("- IVA (21 %): 3,99 €");
    expect(text).toContain("- Total cobrado: 22,99 €");
    expect(text).toContain("- Fecha de inicio: 14 de noviembre de 2026");
    expect(text).toContain("- Próxima renovación: 14 de diciembre de 2026");
    expect(text).toContain("no se ha cobrado dinero real");
  });

  it("explica cómo cancelar desde el panel y que la factura llega aparte por FacturaDirecta", () => {
    const { text, html } = build();
    const panel = `https://staging.zaltyko.test/owner/subscription?organizationId=${organizationId}`;
    expect(text).toContain("cancelar o cambiar de plan cuando quieras desde el panel");
    expect(text).toContain("el plan sigue activo hasta el final del periodo pagado");
    expect(text).toContain(panel);
    expect(html).toContain(`href="${panel}"`);
    expect(text).toContain("Este correo no es una factura.");
    expect(text).toContain("FacturaDirecta");
  });

  it("enlaza a Términos y Privacidad vigentes y da el contacto hola@zaltyko.com", () => {
    const { text, html } = build();
    expect(text).toContain("https://staging.zaltyko.test/terminos");
    expect(text).toContain("https://staging.zaltyko.test/politica-privacidad");
    expect(html).toContain('href="https://staging.zaltyko.test/terminos"');
    expect(html).toContain('href="https://staging.zaltyko.test/politica-privacidad"');
    expect(text).toContain("¿Dudas? Escríbenos a hola@zaltyko.com.");
    expect(html).toContain('href="mailto:hola@zaltyko.com"');
  });

  it("incluye la casilla de inicio inmediato solo si se aceptó su versión vigente", () => {
    expect(build().text).toContain(
      `Al contratar marcaste esta casilla: «${IMMEDIATE_START_CONSENT_TEXT}»`
    );
    expect(build({ immediateStartConsentAccepted: false }).text).not.toContain(
      "Al contratar marcaste"
    );
  });

  it("Growth anual en Live: sin aviso de prueba y con los importes del año", () => {
    const { subject, text } = build({
      environment: "live",
      planCode: "growth",
      billingInterval: "year",
      baseCents: 49000,
      taxCents: 10290,
      totalCents: 59290,
      periodEndsAt: new Date("2027-11-14T10:00:00.000Z"),
    });
    expect(subject).toBe("Confirmación de tu contratación: Zaltyko Growth anual");
    expect(text).toContain("- Plan: Growth (anual)");
    expect(text).toContain("- Precio sin IVA: 490,00 €");
    expect(text).toContain("- IVA (21 %): 102,90 €");
    expect(text).toContain("- Total cobrado: 592,90 €");
    expect(text).toContain("- Próxima renovación: 14 de noviembre de 2027");
    expect(text).not.toContain("modo de prueba");
  });

  it("no atribuye un 21 % que Stripe no cobró (test sin tax rate)", () => {
    const { text } = build({ taxCents: 0, totalCents: 1900 });
    expect(text).toContain("- IVA: 0,00 €");
    expect(text).not.toContain("IVA (21 %)");
  });

  it("escapa el nombre de la organización en el HTML", () => {
    const { html } = build({}, '<script>alert("x")</script> & Co');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Co");
  });

  it("identifica al prestador con el NIF solo cuando está configurado", () => {
    expect(build().text).toContain("Zaltyko es un servicio de Titular de prueba.");
    const withTaxId = buildSaasContractConfirmationEmail({
      confirmation: confirmation(),
      organizationName: null,
      appUrl: "https://staging.zaltyko.test",
      seller: { ...seller, taxId: "12345678Z" },
    });
    expect(withTaxId.text).toContain("Zaltyko es un servicio de Titular de prueba (NIF 12345678Z).");
  });
});

describe("primera factura pagada → datos de confirmación", () => {
  const baseInput = {
    environment: "test" as const,
    organizationId,
    requestedByMemberId: memberId,
    planCode: "starter" as const,
    billingInterval: "month" as const,
    subscriptionReference: "sub_synthetic",
    subscriptionMetadata: { immediate_start_consent: "desistimiento-14d-v1" },
    periodStartedAt: new Date("2026-11-14T10:00:00.000Z"),
    periodEndsAt: new Date("2026-12-14T10:00:00.000Z"),
  };
  const invoice = {
    id: "in_synthetic",
    billing_reason: "subscription_create",
    subtotal: 1900,
    total_excluding_tax: 1900,
    total: 2299,
    customer_email: "  Facturacion@Example.invalid ",
  };

  it("toma base, IVA y total de la factura de Stripe", () => {
    expect(
      saasContractConfirmationFromPaidInvoice({ ...baseInput, invoice })
    ).toEqual({
      environment: "test",
      organizationId,
      requestedByMemberId: memberId,
      planCode: "starter",
      billingInterval: "month",
      subscriptionReference: "sub_synthetic",
      invoiceReference: "in_synthetic",
      baseCents: 1900,
      taxCents: 399,
      totalCents: 2299,
      periodStartedAt: baseInput.periodStartedAt,
      periodEndsAt: baseInput.periodEndsAt,
      checkoutEmail: "facturacion@example.invalid",
      immediateStartConsentAccepted: true,
    });
  });

  it.each(["subscription_cycle", "subscription_update", "manual", undefined])(
    "no confirma de nuevo con billing_reason %s (renovación o cambio de plan)",
    (billingReason) => {
      expect(
        saasContractConfirmationFromPaidInvoice({
          ...baseInput,
          invoice: { ...invoice, billing_reason: billingReason },
        })
      ).toBeNull();
    }
  );

  it("no envía nada a las organizaciones del ensayo QA congelado", () => {
    expect(
      saasContractConfirmationFromPaidInvoice({
        ...baseInput,
        organizationId: SHORT_PAID_QA_ORGANIZATIONS[0],
        invoice,
      })
    ).toBeNull();
  });

  it("descarta importes incoherentes en vez de inventarlos", () => {
    expect(
      saasContractConfirmationFromPaidInvoice({
        ...baseInput,
        invoice: { ...invoice, total: 1000 },
      })
    ).toBeNull();
    expect(
      saasContractConfirmationFromPaidInvoice({
        ...baseInput,
        invoice: { ...invoice, total: undefined },
      })
    ).toBeNull();
  });

  it("no da por aceptada una versión de la casilla distinta de la vigente", () => {
    expect(
      saasContractConfirmationFromPaidInvoice({
        ...baseInput,
        subscriptionMetadata: { immediate_start_consent: "otra-version" },
        invoice,
      })?.immediateStartConsentAccepted
    ).toBe(false);
  });
});

describe("envío idempotente y tolerante a fallos", () => {
  function accountRow(accountEmail: string | null) {
    mocks.execute.mockResolvedValue({
      rows: [{ organization_name: "Club Gimnasia Sintético", account_email: accountEmail }],
    });
  }

  it("envía a la cuenta del Owner con la plantilla y una clave idempotente por suscripción", async () => {
    accountRow("owner@example.invalid");
    mocks.send.mockResolvedValue(true);

    await expect(sendSaasContractConfirmationEmail(confirmation())).resolves.toBe("sent");

    expect(mocks.send).toHaveBeenCalledTimes(1);
    const options = mocks.send.mock.calls[0]![0];
    expect(options).toMatchObject({
      purpose: "transactional",
      to: "owner@example.invalid",
      replyTo: "hola@zaltyko.com",
      template: SAAS_CONTRACT_CONFIRMATION_TEMPLATE,
      dedupeKey: "saas-contract-confirmation:test:sub_synthetic",
    });
    // Correo legal: las preferencias de notificaciones no pueden silenciarlo.
    expect(options.profileId).toBeUndefined();
    expect(options.notificationType).toBeUndefined();
    expect(plain(options.text)).toContain("- Total cobrado: 22,99 €");
    expect(options.text).toContain("hola@zaltyko.com");
  });

  it("usa el email de Checkout si la cuenta ya no tiene email", async () => {
    accountRow(null);
    mocks.send.mockResolvedValue(true);

    await sendSaasContractConfirmationEmail(confirmation());

    expect(mocks.send.mock.calls[0]![0].to).toBe("facturacion@example.invalid");
  });

  it("sin destinatario no intenta el envío", async () => {
    accountRow(null);

    await expect(
      sendSaasContractConfirmationEmail(confirmation({ checkoutEmail: null }))
    ).resolves.toBe("skipped");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledTimes(1);
  });

  it("un segundo intento para la misma suscripción no envía otro correo", async () => {
    accountRow("owner@example.invalid");
    // Modelo de email_logs: idempotency_key es UNIQUE, el segundo insert cede.
    const delivered = new Set<string>();
    mocks.send.mockImplementation(async ({ dedupeKey }: { dedupeKey: string }) => {
      if (delivered.has(dedupeKey)) return false;
      delivered.add(dedupeKey);
      return true;
    });

    const first = await sendSaasContractConfirmationEmail(confirmation());
    const retry = await sendSaasContractConfirmationEmail(
      confirmation({ invoiceReference: "in_synthetic" })
    );

    expect([first, retry]).toEqual(["sent", "skipped"]);
    expect(delivered.size).toBe(1);
    expect(saasContractConfirmationDedupeKey(confirmation())).toBe(
      "saas-contract-confirmation:test:sub_synthetic"
    );
    expect(
      saasContractConfirmationDedupeKey(confirmation({ environment: "live" }))
    ).not.toBe(saasContractConfirmationDedupeKey(confirmation()));
  });

  it("un fallo del proveedor se registra y no se propaga", async () => {
    accountRow("owner@example.invalid");
    mocks.send.mockRejectedValue(new Error("BREVO_API_ERROR:500"));

    await expect(sendSaasContractConfirmationEmail(confirmation())).resolves.toBe("failed");
    expect(mocks.error).toHaveBeenCalledWith(
      "saas_billing.contract_confirmation_failed",
      expect.any(Error),
      expect.objectContaining({ subscriptionReference: "sub_synthetic" })
    );
  });

  it("un fallo al leer la cuenta tampoco se propaga", async () => {
    mocks.execute.mockRejectedValue(new Error("database unavailable"));

    await expect(sendSaasContractConfirmationEmail(confirmation())).resolves.toBe("failed");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

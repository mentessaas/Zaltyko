import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { logger } from "@/lib/logger";
import { reportInvoiceCustomerTaxIdIssue } from "@/modules/saas-billing/application/webhook-service";
import type { SaasStripeConfig } from "@/modules/saas-billing/application/saas-billing-config";

// Identificadores sintéticos generados con el algoritmo de control.
const config = { environment: "test", providerAccountReference: "acct_synthetic" } as SaasStripeConfig;
const event = { id: "evt_synthetic", type: "invoice.paid" } as never;
const subscription = { metadata: { zaltyko_saas: "true", zaltyko_plan: "starter", organization_id: "org-synthetic" } };
const paidInvoice = (customer_tax_ids: unknown) => ({ id: "in_synthetic", status: "paid", customer_tax_ids });

beforeEach(() => vi.mocked(logger.error).mockClear());

describe("alerta de NIF en facturas SaaS pagadas", () => {
  it("alerta sin el valor del NIF cuando el CIF tiene el control incorrecto, sin cambiar el resultado", () => {
    const result = { outcome: "processed" as const, organizationId: "org-synthetic" };
    reportInvoiceCustomerTaxIdIssue({
      event, config, subscription, result,
      invoice: paidInvoice([{ type: "es_cif", value: "B12345675" }]),
    });
    expect(logger.error).toHaveBeenCalledOnce();
    const [, , context] = vi.mocked(logger.error).mock.calls[0]!;
    expect(context).toMatchObject({
      alert: "saas_invoice_customer_tax_id", issue: "invalid_spanish_tax_id",
      invoiceReference: "in_synthetic", organizationId: "org-synthetic", outcome: "processed",
    });
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls[0])).not.toContain("B12345675");
    expect(result).toEqual({ outcome: "processed", organizationId: "org-synthetic" });
  });

  it("alerta cuando la factura no lleva NIF", () => {
    reportInvoiceCustomerTaxIdIssue({
      event, config, subscription, result: { outcome: "processed" }, invoice: paidInvoice([]),
    });
    expect(vi.mocked(logger.error).mock.calls[0]?.[2]).toMatchObject({ issue: "missing" });
  });

  it("no alerta con un NIF válido ni fuera del flujo con IVA español", () => {
    reportInvoiceCustomerTaxIdIssue({
      event, config, subscription, result: { outcome: "processed" },
      invoice: paidInvoice([{ type: "es_cif", value: "B12345674" }]),
    });
    reportInvoiceCustomerTaxIdIssue({
      event, config, subscription: { metadata: { zaltyko_saas: "true" } }, result: { outcome: "processed" },
      invoice: paidInvoice([]),
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("nunca lanza aunque el registro falle", () => {
    vi.mocked(logger.error).mockImplementationOnce(() => { throw new Error("synthetic logger failure"); });
    expect(() => reportInvoiceCustomerTaxIdIssue({
      event, config, subscription, result: { outcome: "processed" }, invoice: paidInvoice(null),
    })).not.toThrow();
  });
});

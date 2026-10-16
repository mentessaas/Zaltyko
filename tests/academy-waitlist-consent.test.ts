import { describe, expect, it } from "vitest";

import { ContactRequestSchema } from "@/lib/growth/contracts";
import {
  academyWaitlistConsentVersion,
  SubscriptionSchema,
} from "@/lib/directory/communications";

const contact = {
  name: "Directora de prueba",
  email: "directora@example.test",
  reason: "sales" as const,
  source: "academy_waitlist",
  message: "Solicitud sintética de novedades desde la waitlist.",
  submissionId: "f52e25cc-a7ad-44b2-b2db-f1380179ea07",
};

describe("consentimiento de la waitlist de academias", () => {
  it("acepta la solicitud de novedades con autorización explícita", () => {
    expect(
      ContactRequestSchema.safeParse({ ...contact, marketingConsent: true })
        .success
    ).toBe(true);
  });

  it("mantiene los contactos antiguos sin darlos de alta en marketing", () => {
    const result = ContactRequestSchema.safeParse(contact);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.marketingConsent).toBe(false);
  });

  it("no permite usar el consentimiento de la waitlist en otro formulario", () => {
    expect(
      ContactRequestSchema.safeParse({
        ...contact,
        source: "contact_form",
        marketingConsent: true,
      }).success
    ).toBe(false);
  });

  it("registra la versión específica de consentimiento para el doble opt-in", () => {
    expect(
      SubscriptionSchema.safeParse({
        email: contact.email,
        purpose: "marketing",
        consent: true,
        version: academyWaitlistConsentVersion,
        source: "academy_waitlist",
        filters: {},
      }).success
    ).toBe(true);
    expect(
      SubscriptionSchema.safeParse({
        email: contact.email,
        purpose: "marketing",
        consent: true,
        version: "directory-2026-09-30",
        source: "academy_waitlist",
        filters: {},
      }).success
    ).toBe(false);
  });
});

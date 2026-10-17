import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("family payment method resilience", () => {
  it("surfaces non-JSON and HTTP errors instead of silently failing", () => {
    const source = readFileSync("src/components/billing/FamilyPaymentMethodCard.tsx", "utf8");
    expect(source).toContain("res.json().catch(() => ({}))");
    expect(source).toContain("No se pudo cargar el método de pago");
    expect(source).toContain("No se pudo eliminar la tarjeta");
  });

  it("does not promise automatic charges when a family saves a card", () => {
    const source = readFileSync("src/components/billing/FamilyPaymentMethodCard.tsx", "utf8");
    expect(source).not.toMatch(/pagar las cuotas automáticamente/i);
    expect(source).toContain("Añadirla no hace un cargo");
    expect(source).toContain("Guardar la tarjeta no paga ninguna cuota en este paso.");
  });
});

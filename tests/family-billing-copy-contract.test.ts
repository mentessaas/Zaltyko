import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PRODUCT_PLANS } from "@/lib/plans/catalog";

const modeCardCopy = readFileSync(
  "src/components/owner-dashboard/FamilyCollectionModeCard.tsx",
  "utf8"
);
const ownerPaymentsCopy = readFileSync(
  "src/app/owner/payments/page.tsx",
  "utf8"
);
const billingGuide = JSON.parse(
  readFileSync(
    "src/content/blog/es/organizar-cobros-mensuales-academia-gimnasia.json",
    "utf8"
  )
) as { content: string[] };

describe("family billing copy contract", () => {
  it("distinguishes a saved automatic request from the effective manual mode", () => {
    expect(modeCardCopy).toContain("Cobro familiar: modalidad efectiva manual");
    expect(modeCardCopy).toContain("Solicitar automático");
    expect(modeCardCopy).toContain(
      "Solicitud automática guardada; el cobro efectivo sigue siendo manual."
    );
  });

  it("keeps Free and Starter manual and discloses no family autopay in Growth", () => {
    const free = PRODUCT_PLANS.find((plan) => plan.code === "free");
    const starter = PRODUCT_PLANS.find((plan) => plan.code === "pro");
    const growth = PRODUCT_PLANS.find((plan) => plan.code === "premium");

    expect(free?.features.join(" ")).toMatch(/registro manual/i);
    expect(starter?.features.join(" ")).toMatch(/registro manual/i);
    expect(growth?.features.join(" ")).toMatch(
      /cobro familiar automático aún no está disponible/i
    );
  });

  it("separates general automation advice from Zaltyko's current capability", () => {
    expect(billingGuide.content.join(" ")).toContain(
      "En Zaltyko, el cobro familiar automático aún no está disponible y la academia registra manualmente los pagos recibidos."
    );
    expect(billingGuide.content.join(" ")).not.toContain(
      "El software de gestión cubre todo esto."
    );
  });

  it("describes the balance update as the result of saving a manual payment", () => {
    expect(ownerPaymentsCopy).toContain(
      "Al guardar,\n              Zaltyko lo vincula al cargo y actualiza el saldo pendiente."
    );
    expect(ownerPaymentsCopy).not.toContain(
      "actualiza el saldo pendiente automáticamente"
    );
  });
});

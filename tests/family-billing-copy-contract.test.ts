import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PRODUCT_PLANS } from "@/lib/plans/catalog";

const switchCopy = readFileSync(
  "src/components/owner-dashboard/OwnerFamilyPaymentMethodsPanel.tsx",
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
  it("offers a single per-family switch in plain words and no longer a saved request card", () => {
    expect(existsSync("src/components/owner-dashboard/FamilyCollectionModeCard.tsx")).toBe(false);
    expect(switchCopy).toContain("Cobrar automáticamente");
    expect(switchCopy.match(/<Switch\b/g) ?? []).toHaveLength(1);
    expect(switchCopy).not.toMatch(/PaymentIntent|off-session|webhook|Connect\b/);
  });

  it("keeps Free and Starter manual and discloses no family autopay in Growth", () => {
    const free = PRODUCT_PLANS.find((plan) => plan.code === "free");
    const starter = PRODUCT_PLANS.find((plan) => plan.code === "pro");
    const growth = PRODUCT_PLANS.find((plan) => plan.code === "premium");

    expect(free?.features.join(" ")).toMatch(/registro manual/i);
    expect(starter?.features.join(" ")).toMatch(/registro manual/i);
    expect(growth?.features.join(" ")).toMatch(/registro manual/i);
    for (const plan of [free, starter, growth]) {
      expect(plan?.features.join(" ")).not.toMatch(/pagos automáticos|cobro automático/i);
    }
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
    const normalizedOwnerPaymentsCopy = ownerPaymentsCopy.replace(/\s+/g, " ");
    expect(normalizedOwnerPaymentsCopy).toContain(
      "Al guardar, Zaltyko lo vincula al cargo y actualiza el saldo pendiente."
    );
    expect(normalizedOwnerPaymentsCopy).not.toContain(
      "actualiza el saldo pendiente automáticamente"
    );
  });
});

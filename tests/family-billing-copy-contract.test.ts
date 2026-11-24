import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PRODUCT_PLANS, PUBLIC_PRODUCT_PLANS } from "@/lib/plans/catalog";

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

  it("keeps family payments manual today and scopes future automation to Club", () => {
    const free = PRODUCT_PLANS.find((plan) => plan.code === "free");
    const club = PRODUCT_PLANS.find((plan) => plan.code === "club");

    expect(free?.features.join(" ")).toMatch(/cuotas a mano/i);
    expect(club?.features.join(" ")).toMatch(/cobro automático.*cuando se active/i);
    expect(PUBLIC_PRODUCT_PLANS.map((plan) => plan.code)).toEqual(["free", "club"]);
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

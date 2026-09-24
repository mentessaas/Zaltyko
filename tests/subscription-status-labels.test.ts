import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { getSubscriptionStatusLabel } from "@/lib/billing/subscription-status-labels";

describe("subscription status labels", () => {
  it("translates persisted lifecycle states for customer-facing surfaces", () => {
    expect(getSubscriptionStatusLabel("active")).toBe("Activo");
    expect(getSubscriptionStatusLabel("trialing")).toBe("En período de prueba");
    expect(getSubscriptionStatusLabel("past_due")).toBe("Pago pendiente");
    expect(getSubscriptionStatusLabel("canceled")).toBe("Cancelado");
    expect(getSubscriptionStatusLabel("cancelled")).toBe("Cancelado");
  });

  it("does not leak raw or missing status values", () => {
    expect(getSubscriptionStatusLabel(" ACTIVE ")).toBe("Activo");
    expect(getSubscriptionStatusLabel("future_status")).toBe("Estado no disponible");
    expect(getSubscriptionStatusLabel(null)).toBe("Estado no disponible");
  });

  it("uses the shared resolver in the Super Admin chart and plan usage card", () => {
    const dashboard = readFileSync(
      "src/app/(super-admin)/super-admin/components/SuperAdminDashboard.tsx",
      "utf8",
    );
    const planUsage = readFileSync("src/components/dashboard/PlanUsage.tsx", "utf8");
    const billingSummary = readFileSync("src/components/billing/BillingSummary.tsx", "utf8");
    const billingPanel = readFileSync("src/components/billing/BillingPanel.tsx", "utf8");
    const stripeConnect = readFileSync("src/components/billing/StripeConnectCard.tsx", "utf8");
    const academyDetail = readFileSync(
      "src/app/(super-admin)/super-admin/components/SuperAdminAcademyDetail.tsx",
      "utf8",
    );
    const userDetail = readFileSync(
      "src/app/(super-admin)/super-admin/components/SuperAdminUserDetail.tsx",
      "utf8",
    );

    expect(dashboard).toContain("getSubscriptionStatusLabel");
    expect(dashboard).not.toContain("name: status.status,");
    expect(planUsage).toContain("getSubscriptionStatusLabel(plan.status)");
    expect(billingSummary).toContain("getSubscriptionStatusLabel(summary.status)");
    expect(billingPanel).toContain("getSubscriptionStatusLabel(summary.status)");
    expect(billingPanel).toContain("label: labels.unknown");
    expect(stripeConnect).toContain("getConnectStatusLabel(status.status)");
    expect(stripeConnect).not.toContain("` (${status.status})`");
    expect(academyDetail).toContain("getSubscriptionStatusLabel(academy.subscription.status)");
    expect(userDetail).toContain("getSubscriptionStatusLabel(user.subscription.status)");
  });
});

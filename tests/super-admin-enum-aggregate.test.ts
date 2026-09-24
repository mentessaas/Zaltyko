import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("super-admin aggregate enum contract", () => {
  it("casts enum distributions to text instead of invalid enum fallbacks", () => {
    const source = readFileSync("src/lib/superAdminService.ts", "utf8");
    expect(source).toContain("select role::text as role");
    expect(source).toContain("select status::text as status");
    expect(source).not.toContain("coalesce(role, 'unknown')");
    expect(source).not.toContain("coalesce(status, 'unknown')");
  });

  it("uses database aggregates for historical totals and subscription alerts", () => {
    const source = readFileSync("src/lib/superAdminService.ts", "utf8");
    const globalStatsSource = source.split("export async function getAllAcademies")[0];

    expect(globalStatsSource).toContain("previousRevenueTotal");
    expect(globalStatsSource).toContain("previousAcademyTotal");
    expect(globalStatsSource).toContain("previousUserTotal");
    expect(globalStatsSource).toContain("const statusCount = new Map");
    expect(globalStatsSource).toContain("isNull(athletes.deletedAt)");
    expect(globalStatsSource).toContain("deleted_at is null");
    expect(globalStatsSource).not.toContain("subscriptionsData.length");
    expect(globalStatsSource).not.toContain(".limit(10000)");
  });

  it("does not leave orphaned Auth users when super-admin provisioning fails", () => {
    const academyRoute = readFileSync("src/app/api/super-admin/academies/route.ts", "utf8");
    const userRoute = readFileSync("src/app/api/super-admin/users/route.ts", "utf8");

    expect(academyRoute).toContain("deleteAuthUser");
    expect(academyRoute).toContain("db.delete(profiles)");
    expect(userRoute).toContain("deleteAuthUser");
    expect(userRoute).toContain("db.delete(profiles)");
  });

  it("labels SaaS revenue separately from academy collection volume", () => {
    const source = readFileSync(
      "src/app/(super-admin)/super-admin/components/SuperAdminDashboard.tsx",
      "utf8"
    );

    expect(source).toContain('title: "Cuotas cobradas este mes"');
    expect(source).toContain('subtitle: "Cobros internos de las academias"');
    expect(source).toContain('title: "Planes configurados"');
    expect(source).toContain("Suscripciones por plan");
    expect(source).toContain("plan con suscripciones");
    expect(source).not.toContain('title: "Planes configurados", items: planPieData');
    expect(source).toContain("Ingresos de suscripciones SaaS acumulados");
    expect(source).not.toContain('title: "Ingresos este mes"');
    expect(source).not.toContain('title: "Planes activos"');
  });

  it("renders the monthly SaaS revenue series from paid invoices when available", () => {
    const service = readFileSync("src/lib/superAdminService.ts", "utf8");
    const dashboard = readFileSync(
      "src/app/(super-admin)/super-admin/components/SuperAdminDashboard.tsx",
      "utf8",
    );

    expect(service).toContain("monthlyRevenueTotals");
    expect(service).toContain("date_trunc('month', created_at)");
    expect(service).toContain("status = 'paid'");
    expect(dashboard).toContain("Facturas SaaS pagadas");
    expect(dashboard).not.toContain("Pendiente de serie real por mes desde recibos/cobros");
  });

  it("resolves the super-admin profile by auth user id in support", () => {
    const source = readFileSync("src/app/(super-admin)/super-admin/support/page.tsx", "utf8");
    expect(source).toContain('.eq("user_id", user.id)');
    expect(source).not.toContain('.eq("id", user.id)');
  });
});

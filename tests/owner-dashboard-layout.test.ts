import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DEFAULT_OWNER_DASHBOARD_ORDER,
  ownerDashboardModuleOrderSchema,
} from "@/modules/owner-dashboard/domain/dashboard-layout";

describe("owner dashboard module layout", () => {
  it("defines a stable default and accepts each module exactly once", () => {
    expect(DEFAULT_OWNER_DASHBOARD_ORDER).toEqual([
      "kpis",
      "trends",
      "explanation",
      "operations",
    ]);
    expect(
      ownerDashboardModuleOrderSchema.parse([
        "operations",
        "kpis",
        "trends",
        "explanation",
      ])
    ).toEqual(["operations", "kpis", "trends", "explanation"]);
  });

  it("rejects duplicates, omissions, and unknown modules", () => {
    expect(() =>
      ownerDashboardModuleOrderSchema.parse([
        "kpis",
        "kpis",
        "trends",
        "operations",
      ])
    ).toThrow();
    expect(() =>
      ownerDashboardModuleOrderSchema.parse(["kpis", "trends", "operations"])
    ).toThrow();
    expect(() =>
      ownerDashboardModuleOrderSchema.parse([
        "kpis",
        "trends",
        "explanation",
        "payments",
      ])
    ).toThrow();
  });

  it("offers pointer, keyboard, and single-step accessible reorder controls", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/owner-dashboard/DashboardModuleLayout.tsx"),
      "utf8"
    );
    expect(source).toContain("PointerSensor");
    expect(source).toContain("KeyboardSensor");
    expect(source).toContain("sortableKeyboardCoordinates");
    expect(source).toContain("Subir ${title}");
    expect(source).toContain("Bajar ${title}");
    expect(source).toContain("Restablecer orden");
    expect(source).toContain("/api/v1/owner/dashboard-layout");
  });
});

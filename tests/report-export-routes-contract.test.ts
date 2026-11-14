import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { getRequiredRoutePermission } from "@/lib/authz/route-permissions";

const routeFiles = [
  "class/export",
  "class/email",
  "coach/export",
  "coach/email",
  "churn/export",
  "churn/email",
  "progress/export",
  "progress/email",
].map((route) => `src/app/api/reports/${route}/route.ts`);

describe("acciones visibles de informes", () => {
  it("tienen una implementación server-side para cada botón de la UI", () => {
    for (const file of routeFiles) {
      expect(existsSync(file), file).toBe(true);
      expect(readFileSync(file, "utf8")).toContain("withTenant");
    }
  });

  it("separa lectura, exportación y envío en capacidades explícitas", () => {
    expect(getRequiredRoutePermission("/api/reports/class/export", "GET")).toBe("reports:export");
    expect(getRequiredRoutePermission("/api/reports/coach/email", "POST")).toBe("communications:send");
    expect(getRequiredRoutePermission("/api/reports/churn/email", "POST")).toBe("communications:send");
  });
});

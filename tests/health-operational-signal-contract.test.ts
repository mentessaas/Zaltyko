import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("health operational signal", () => {
  it("reports cron authentication readiness without exposing secrets", () => {
    const source = readFileSync("src/app/api/health/route.ts", "utf8");
    expect(source).toContain("cronAuth");
    expect(source).toContain("process.env.CRON_SECRET ? \"ok\" : \"missing\"");
    expect(source).not.toContain("CRON_SECRET:");
  });

  it("no presenta la autenticación de cron como prueba de ejecución", () => {
    const panel = readFileSync("src/app/status/StatusLivePanel.tsx", "utf8");
    expect(panel).toContain('description: "Autenticación configurada para tareas programadas"');
    expect(panel).toContain('configured: "Configurado"');
    expect(panel).toContain('? "configured"');
    expect(panel).not.toContain('description: "Configuración segura de tareas programadas"');
  });
});

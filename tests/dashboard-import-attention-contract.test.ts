import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard import attention contract", () => {

  it("mantiene la fuente degradable si una instalación aún no tiene la migración", () => {
    const source = readFileSync("src/lib/dashboard/attention-bundle.ts", "utf8");
    expect(source).toContain('logger.warn("attention:loadImportActive unavailable"');
    expect(source).toContain("return null;");
  });

  it("no expone literales técnicos del estado en la tarjeta Mobile", () => {
    const mobile = readFileSync("mobile/app/(tabs)/index.tsx", "utf8");
    expect(mobile).toContain("stateLabel[state]");
    expect(mobile).toContain("Importación con errores");
    expect(mobile).toContain("En curso");
  });
});

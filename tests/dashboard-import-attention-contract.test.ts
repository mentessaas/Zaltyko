import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard import attention contract", () => {
  it("usa el lote persistido y lo limita por tenant, academia y estados accionables", () => {
    const source = readFileSync("src/lib/dashboard/attention-bundle.ts", "utf8");
    expect(source).toContain("athleteImportBatches");
    expect(source).toContain("eq(athleteImportBatches.academyId, academyId)");
    expect(source).toContain("eq(athleteImportBatches.tenantId, tenantId)");
    expect(source).toContain('inArray(athleteImportBatches.status, ["processing", "failed"])');
    expect(source).toContain("batch.skippedCount");
    expect(source).toContain("importBatchId=${batch.id}");
    const athletesPage = readFileSync("src/app/app/[academyId]/athletes/page.tsx", "utf8");
    const table = readFileSync("src/components/athletes/AthletesTableView.tsx", "utf8");
    expect(athletesPage).toContain("initialImportOpen={openImport}");
    expect(table).toContain("useState(initialImportOpen)");
  });

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

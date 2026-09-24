import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard attention user-facing copy", () => {
  it("keeps technical source identifiers out of the rendered dashboard copy", () => {
    const attention = readFileSync("src/components/dashboard/AttentionBlock.tsx", "utf8");
    const priority = readFileSync("src/components/dashboard/PriorityAction.tsx", "utf8");
    const ownerPanel = readFileSync("src/components/dashboard/OwnerAttentionPanel.tsx", "utf8");

    expect(attention).toContain("Datos de tu academia");
    expect(attention).toContain("No pudimos actualizar este indicador");
    expect(attention).not.toContain("Fuente: {source}");
    expect(priority).not.toContain("Fuente: {action.source}");
    expect(ownerPanel).not.toContain("fuentes declaradas en cada bloque");
    expect(ownerPanel).toContain("Abrir planificación");
    expect(ownerPanel).toContain("Revisa la planificación para confirmar el");
    expect(ownerPanel).toContain('id="import-active"');
    expect(ownerPanel).toContain("Importación con errores");
  });
});

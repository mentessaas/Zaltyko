import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("contrato del cierre del mapa de objeciones", () => {
  it("mantiene los artefactos de cierre y aceptación", () => {
    const matrix = read("docs/plans/2026-07-23-objection-closure-matrix.md");
    const runbook = read("docs/plans/2026-07-23-objection-closure-runbook.md");

    expect(matrix).toContain("Matriz de cierre de objeciones");
    expect(matrix).toContain("El mapa queda cerrado");
    expect(runbook).toContain("Owner");
    expect(runbook).toContain("Evidencia requerida");
    expect(runbook).toContain("No se publica ROI");
  });

  it("mantiene los recorridos funcionales cerrados", () => {
    const eventsExport = read("src/app/api/reports/events/export/route.ts");
    const athleteExport = read("src/app/api/athletes/export/route.ts");
    const waitingList = read("src/components/classes/WaitingListDialog.tsx");
    const supportResponses = read("src/app/api/support/tickets/[id]/responses/route.ts");

    expect(eventsExport).toContain('eq(events.academyId, academyId)');
    expect(eventsExport).toContain('bookType: "xlsx"');
    expect(athleteExport).toContain('eq(athletes.academyId, academyId)');
    expect(waitingList).toContain("/api/class-waiting-list?classId=");
    expect(waitingList).not.toContain("placeholder until implement");
    expect(supportResponses).toContain("eq(ticketResponses.isInternal, false)");
  });

  it("no reintroduce claims retirados en la superficie pública", () => {
    const siteFiles = [
      "src/app/(site)/FeaturesSection.tsx",
      "src/app/(site)/modules/comunicacion/page.tsx",
      "src/app/(site)/modules/eventos-competiciones/page.tsx",
    ].map(read).join("\n");

    expect(siteFiles).not.toContain("100% seguro");
    expect(siteFiles).not.toContain("listados oficiales para federaciones");
    expect(siteFiles).not.toContain("inscripciones sin errores");
  });
});

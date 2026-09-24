import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  join(process.cwd(), "src/app/api/athletes/import/route.ts"),
  "utf8",
);
const panel = readFileSync(
  join(process.cwd(), "src/components/athletes/ImportExportPanel.tsx"),
  "utf8",
);
const catalog = readFileSync(
  join(process.cwd(), "src/lib/plans/catalog.ts"),
  "utf8",
);
const rollbackRoute = readFileSync(
  join(process.cwd(), "src/app/api/athletes/import/[batchId]/rollback/route.ts"),
  "utf8",
);

describe("athlete import safety contract", () => {
  it("requires a preview, confirmation, and unchanged file hash before writes", () => {
    expect(route).toContain('createHash("sha256")');
    expect(route).toContain('"IMPORT_CONFIRMATION_REQUIRED"');
    expect(route).toContain('"IMPORT_PREVIEW_REQUIRED"');
    expect(route).toContain('"IMPORT_FILE_CHANGED"');
    expect(route).toContain('if (!dryRun) {');
    expect(route).toContain('requiresConfirmation: dryRun');
    expect(route).toContain("existingIdentityKeys");
    expect(route).toContain("potentialDuplicates");
    expect(route).toContain("withTransaction(async (tx)");
    expect(route).toContain('getResourceCount("athletes"');
    expect(route).toContain("importLimitState");
    expect(route).toContain("isNull(groups.deletedAt)");
    expect(route).toContain("athleteImportBatches");
    expect(route).toContain("importBatchId");
    expect(route).toContain('status: "completed"');
  });

  it("makes the safe preview flow explicit in the UI", () => {
    expect(panel).toContain("Previsualizar importación");
    expect(panel).toContain("Confirmar e importar");
    expect(panel).toContain('formData.append("dryRun", String(dryRun))');
    expect(panel).toContain('formData.append("previewHash", previewHash)');
    expect(panel).toContain("error?.message ?? error?.error");
    expect(panel).toContain("Deshacer esta importación");
    expect(panel).toContain("Sí, deshacer importación");
    expect(panel).toContain("/rollback");
  });

  it("keeps the family portal claim honest in the canonical catalog", () => {
    expect(catalog).toContain("Portal familiar limitado");
    expect(catalog).not.toContain("Portal de familias completo");
  });

  it("only rolls back completed batches inside every affected academy scope", () => {
    expect(rollbackRoute).toContain("withTenant");
    expect(rollbackRoute).toContain("authorizeAcademyCapability");
    expect(rollbackRoute).toContain('permission: "athletes:delete"');
    expect(rollbackRoute).toContain('batch.status !== "completed"');
    expect(rollbackRoute).toContain('status: "rolled_back"');
    expect(rollbackRoute).toContain("importBatchId");
    expect(rollbackRoute).toContain("athletes.import_rollback");
  });
});

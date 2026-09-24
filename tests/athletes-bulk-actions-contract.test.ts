import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/app/api/athletes/bulk-archive/route.ts"),
  "utf8",
);
const tableSections = readFileSync(
  resolve(process.cwd(), "src/components/athletes/AthletesTableSections.tsx"),
  "utf8",
);
const tableView = readFileSync(
  resolve(process.cwd(), "src/components/athletes/AthletesTableView.tsx"),
  "utf8",
);
const editDialog = readFileSync(
  resolve(process.cwd(), "src/components/athletes/EditAthleteDialog.tsx"),
  "utf8",
);
const athletesPage = readFileSync(
  resolve(process.cwd(), "src/app/app/[academyId]/athletes/page.tsx"),
  "utf8",
);
const kanban = readFileSync(
  resolve(process.cwd(), "src/components/athletes/AthletesKanbanView.tsx"),
  "utf8",
);
const restoreRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/athletes/[athleteId]/restore/route.ts"),
  "utf8",
);

describe("athletes bulk actions contract", () => {
  it("offers only implemented bulk actions", () => {
    expect(tableSections).toContain('value="archive"');
    expect(tableSections).toContain('value="export"');
    expect(tableSections).not.toContain('value="delete"');
    expect(tableSections).not.toContain('value="message"');
  });

  it("archives the selected rows through the canonical tenant route", () => {
    expect(tableView).toContain('fetch("/api/athletes/bulk-archive"');
    expect(tableView).toContain('method: "POST"');
    expect(tableView).toContain("selectedAthletes");
    expect(tableView).toContain("Se conservará su historial");
  });

  it("exports only the selected rows when the batch export is chosen", () => {
    expect(tableView).toContain('if (action === "export")');
    expect(tableView).toContain("filteredAthletes.filter((athlete) => selectedAthletes.has(athlete.id))");
  });

  it("keeps individual athlete removal honest as a reversible archive", () => {
    expect(editDialog).toContain("Archivar");
    expect(editDialog).toContain("conservaremos su historial");
    expect(editDialog).toContain('confirmText="Archivar"');
  });

  it("requires tenant, academy capability, bounded ids and atomic update on the server", () => {
    expect(route).toContain("withTenant");
    expect(route).toContain('permission: "athletes:delete"');
    expect(route).toContain("z.string().uuid()");
    expect(route).toContain(".max(100");
    expect(route).toContain("withTransaction");
    expect(route).toContain("inArray(athletes.id");
    expect(route).toContain("BulkArchiveConflictError");
    expect(route).toContain("throw new BulkArchiveConflictError");
    expect(route).toContain("apiSuccess");
    expect(route).toContain("withRateLimit");
  });

  it("makes the archive lifecycle recoverable without exposing dead links", () => {
    expect(athletesPage).toContain('statusFilter === "archived"');
    expect(athletesPage).toContain('eq(athletes.status, "archived")');
    expect(tableView).toContain("/restore");
    expect(tableSections).toContain("Restaurar");
    expect(tableSections).toContain('athlete.status === "archived"');
    expect(restoreRoute).toContain('permission: "athletes:update"');
    expect(restoreRoute).toContain("isNotNull(athletes.deletedAt)");
    expect(restoreRoute).toContain('set({ status: "active", deletedAt: null })');
    expect(restoreRoute).toContain("withTransaction");
  });

  it("renders a real Kanban instead of a permanent loading placeholder", () => {
    expect(kanban).toContain("KANBAN_STATUSES");
    expect(kanban).toContain("statusAthletes");
    expect(kanban).not.toContain("Cargando");
    expect(tableView).toContain("<AthletesKanbanView");
    expect(tableView).toContain("filteredAthletes");
  });
});

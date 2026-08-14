import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  SANDBOX_ACADEMY_ID,
  SandboxMigrationError,
  SandboxMigrationStore,
  parseSandboxFile,
  previewSandboxMigration,
  type SandboxCatalog,
  type SandboxPreviewInput,
} from "@/lib/migration/sandbox";

const fixtureDir = resolve(process.cwd(), "tests/fixtures/mig-syn-01");
const catalog: SandboxCatalog = {
  groups: [{ code: "base_3", aliases: ["Base 3"] }],
  sportConfigCodes: ["RFEG-2026-V2"],
};
const scope = { tenantId: "tenant-synthetic", academyId: SANDBOX_ACADEMY_ID };
const actor = { id: "owner-synthetic", role: "owner" as const };

function fixture(name: string): { headers: string[]; rows: Record<string, string>[] } {
  const parsed = parseSandboxFile(name, readFileSync(resolve(fixtureDir, name)));
  return { headers: parsed.headers, rows: parsed.rows as Record<string, string>[] };
}

function athleteInput(name = "athletes.csv"): SandboxPreviewInput {
  const parsed = fixture(name);
  return {
    ...scope,
    actor,
    module: "athletes",
    headers: parsed.headers,
    rows: parsed.rows,
    catalog,
    synthetic: true,
  };
}

function financeInput(name = "finances.csv"): SandboxPreviewInput {
  const parsed = fixture(name);
  return {
    ...scope,
    actor,
    module: "debts",
    headers: parsed.headers,
    rows: parsed.rows,
    catalog,
    synthetic: true,
    expectedTotals: { charges: 285, payments: 150, refunds: 0, openingBalance: 135 },
  };
}

describe("sandbox migration contract", () => {
  it("previews MIG-SYN-01 without creating records and reports row-level blockers", () => {
    const preview = previewSandboxMigration(athleteInput());

    expect(preview.status).toBe("preview_ready");
    expect(preview.summary.total).toBe(9);
    expect(preview.summary.valid).toBe(4);
    expect(preview.summary.duplicates).toBe(1);
    expect(preview.summary.ambiguous).toBe(1);
    expect(preview.summary.invalid).toBe(3);
    expect(preview.canCommit).toBe(false);
    expect(preview.rows.find((row) => row.rowNumber === 4)?.issues[0]?.code).toBe("DUPLICATE_SUSPECTED");
    expect(preview.rows.find((row) => row.rowNumber === 5)?.issues[0]?.code).toBe("AMBIGUOUS_DATE");
  });

  it("keeps twins with different external IDs separate and does not semantic-dedupe", () => {
    const preview = previewSandboxMigration(athleteInput());
    const twins = preview.rows.filter((row) => row.state === "valid" && ["A-001", "A-002"].includes(row.externalId ?? ""));

    expect(twins).toHaveLength(2);
    expect(twins.every((row) => row.state === "valid")).toBe(true);
  });

  it("requires explicit omissions before committing a preview with errors", () => {
    const store = new SandboxMigrationStore();
    const created = store.create(athleteInput());
    const resolved = store.resolve(created.jobId, {
      4: "omit",
      5: "omit",
      7: "omit",
      8: "omit",
      9: "omit",
    }, scope);

    expect(resolved.status).toBe("validated");
    expect(resolved.canCommit).toBe(true);
    expect(store.commit(created.jobId, scope).committedExternalIds).toEqual(["A-001", "A-002", "A-004", "A-008"]);
  });

  it("rolls back only the synthetic job and rejects a second rollback", () => {
    const store = new SandboxMigrationStore();
    const created = store.create(athleteInput());
    store.resolve(created.jobId, { 4: "omit", 5: "omit", 7: "omit", 8: "omit", 9: "omit" }, scope);
    store.commit(created.jobId, scope);

    const rolledBack = store.rollback(created.jobId, scope);
    expect(rolledBack.status).toBe("rolled_back");
    expect(rolledBack.committedExternalIds).toEqual([]);
    expect(rolledBack.rows.filter((row) => row.state === "rolled_back")).toHaveLength(4);
    expect(() => store.rollback(created.jobId, scope)).toThrowError(SandboxMigrationError);
    expect(() => store.rollback(created.jobId, scope)).toThrow(/ya fue aplicado/);
  });

  it("fails closed on a different tenant or academy", () => {
    const store = new SandboxMigrationStore();
    const created = store.create(athleteInput());

    expect(() => store.get(created.jobId, { tenantId: "other-tenant", academyId: SANDBOX_ACADEMY_ID })).toThrow(/No tienes acceso/);
    expect(() => store.get(created.jobId, { tenantId: scope.tenantId, academyId: "00000000-aaaa-0000-0000-000000000002" })).toThrow(/No tienes acceso/);
  });

  it("reconciles operational charges separately from the synthetic opening balance", () => {
    const preview = previewSandboxMigration(financeInput());

    expect(preview.totals).toEqual({ charges: 285, payments: 150, refunds: 0, openingBalance: 135, mismatch: false });
    expect(preview.canCommit).toBe(true);
    expect(preview.rows.some((row) => row.fields.kind === "payment" && row.state === "valid")).toBe(true);
  });

  it("blocks a finance mismatch before commit and never infers paid", () => {
    const preview = previewSandboxMigration(financeInput("finances-mismatch.xlsx"));

    expect(preview.totals?.mismatch).toBe(true);
    expect(preview.canCommit).toBe(false);
    expect(preview.rows.every((row) => row.fields.kind !== "payment" || row.state === "invalid")).toBe(true);
    expect(preview.rows.flatMap((row) => row.issues).some((item) => item.code === "IMPORT_TOTAL_MISMATCH")).toBe(true);
  });

  it("rejects finance rows with missing identity, non-EUR money, ambiguous amounts, and missing references", () => {
    const preview = previewSandboxMigration(financeInput("finances-rejected.csv"));

    expect(preview.summary.invalid).toBe(6);
    expect(preview.canCommit).toBe(false);
    expect(preview.rows.flatMap((row) => row.issues).every((item) => item.code === "IMPORT_ROW_INVALID")).toBe(true);
  });

  it("accepts a flat XLSX and rejects multisheet or merged structures", () => {
    const flat = fixture("athletes-flat.xlsx");
    expect(flat.rows).toHaveLength(5);
    expect(() => parseSandboxFile("athletes-multisheet.xlsx", readFileSync(resolve(fixtureDir, "athletes-multisheet.xlsx")))).toThrow(/única hoja plana/);
  });

  it("exports modules independently with a manifest and honest partial state", () => {
    const store = new SandboxMigrationStore();
    const created = store.create(athleteInput());
    store.resolve(created.jobId, { 4: "omit", 5: "omit", 7: "omit", 8: "omit", 9: "omit" }, scope);
    store.commit(created.jobId, scope);

    const athletes = store.export(created.jobId, "athletes", scope);
    const notes = store.export(created.jobId, "notes", scope);
    expect(athletes.status).toBe("ready");
    expect(athletes.manifest.module).toBe("athletes");
    expect(athletes.manifest.checksum_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(athletes.csv).toContain("external_id,name,dob");
    expect(notes.status).toBe("partial");
    expect(notes.failures).toEqual([{ module: "notes", code: "MODULE_NOT_IMPORTED" }]);
  });

  it("replays the same idempotency key and rejects a changed payload", () => {
    const store = new SandboxMigrationStore();
    const first = store.create({ ...athleteInput(), idempotencyKey: "mig-syn-replay" });
    const replay = store.create({ ...athleteInput(), idempotencyKey: "mig-syn-replay" });

    expect(replay.jobId).toBe(first.jobId);
    expect(() => store.create({ ...athleteInput(), idempotencyKey: "mig-syn-replay", rows: athleteInput().rows.slice(0, 1) })).toThrow(/payload diferente/);
  });

  it("rejects a non-synthetic academy before reading domain data", () => {
    expect(() => previewSandboxMigration({ ...athleteInput(), academyId: "00000000-aaaa-0000-0000-000000000002" })).toThrow(/solo acepta la academia sintética/);
  });
});

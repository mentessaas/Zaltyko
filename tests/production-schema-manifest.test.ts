import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  checkProductionSchemaManifest,
  parseStaticCheckSource,
  PRODUCTION_SCHEMA_CANDIDATE,
  PRODUCTION_SCHEMA_ORDER,
  type ProductionSchemaManifest,
} from "../scripts/lib/production-schema-manifest";
import {
  E2E_DOMAIN_MIGRATIONS,
  E2E_LOCAL_OWNER_SIGNUP_MIGRATIONS,
  E2E_LOCAL_OWNER_MONTHLY_TARIFF_MIGRATIONS,
} from "../scripts/lib/e2e-domain-migrations";

function fixture() {
  // Synthetic bytes only; no SQL execution or application rows.
  const files = new Map(
    PRODUCTION_SCHEMA_ORDER.map((filename, index) => [
      filename as string,
      Buffer.from(`synthetic migration ${index}\n`),
    ])
  );
  const manifest: ProductionSchemaManifest = {
    formatVersion: 1,
    candidateCommit: PRODUCTION_SCHEMA_CANDIDATE,
    mode: "static-only",
    migrations: PRODUCTION_SCHEMA_ORDER.map((filename, index) => ({
      sequence: index + 1,
      filename,
      sha256: createHash("sha256").update(files.get(filename)!).digest("hex"),
    })),
  };
  const read = vi.fn((filename: string) => {
    const content = files.get(filename);
    if (!content) throw new Error("synthetic unreadable file");
    return content;
  });
  return { files, manifest, read };
}

describe("production schema manifest: static verification only", () => {
  it("composes 16 sandbox entries and two separate deltas without sorting", () => {
    expect(E2E_DOMAIN_MIGRATIONS).toHaveLength(16);
    expect(PRODUCTION_SCHEMA_ORDER).toEqual([
      ...E2E_DOMAIN_MIGRATIONS,
      ...E2E_LOCAL_OWNER_SIGNUP_MIGRATIONS,
      ...E2E_LOCAL_OWNER_MONTHLY_TARIFF_MIGRATIONS,
    ]);
    expect(PRODUCTION_SCHEMA_ORDER[1]).toMatch(/^20261013100000_/);
    expect(PRODUCTION_SCHEMA_ORDER[2]).toMatch(/^20261006085254_/);
    expect(PRODUCTION_SCHEMA_ORDER[12]).toMatch(/^20261013120000_/);
    expect(PRODUCTION_SCHEMA_ORDER[13]).toMatch(/^20261013082806_/);
  });

  it("ships a pinned manifest with 18 valid entries in the reviewed order", () => {
    const manifest = JSON.parse(
      readFileSync(
        resolve("docs/deployment/production-schema-manifest-5d072d19.json"),
        "utf8"
      )
    );
    const read = vi.fn(() => Buffer.from("deliberately different bytes"));
    const result = checkProductionSchemaManifest(manifest, read);
    expect(read).toHaveBeenCalledTimes(18);
    expect(result.issues).toHaveLength(18);
    expect(
      result.issues.every((issue) => issue.code === "CHECKSUM_MISMATCH")
    ).toBe(true);
  });

  it("passes exact bytes while denying readiness and activation claims", () => {
    const { manifest, read } = fixture();
    const result = checkProductionSchemaManifest(manifest, read);
    expect(result).toMatchObject({
      status: "PASS",
      mode: "static-only",
      checkedFiles: 18,
      schemaReadiness: "NOT_VERIFIED",
      activationAllowed: false,
      issues: [],
    });
    expect(read.mock.calls.map(([filename]) => filename)).toEqual(
      PRODUCTION_SCHEMA_ORDER
    );
  });

  it("blocks a one-byte change, including an added final newline", () => {
    const { manifest, read, files } = fixture();
    const filename = PRODUCTION_SCHEMA_ORDER[4];
    files.set(
      filename,
      Buffer.concat([files.get(filename)!, Buffer.from("\n")])
    );
    expect(checkProductionSchemaManifest(manifest, read)).toMatchObject({
      status: "BLOCKED",
      checkedFiles: 18,
      issues: [{ code: "CHECKSUM_MISMATCH", filename }],
    });
  });

  it("blocks absent files without a fallback to another source", () => {
    const { manifest, read, files } = fixture();
    const filename = PRODUCTION_SCHEMA_ORDER[17];
    files.delete(filename);
    expect(checkProductionSchemaManifest(manifest, read)).toMatchObject({
      status: "BLOCKED",
      checkedFiles: 17,
      issues: [{ code: "FILE_UNAVAILABLE", filename }],
    });
    expect(read).toHaveBeenCalledTimes(18);
  });

  it.each(["swap", "chronological", "sequence", "duplicate", "unknown"])(
    "rejects %s order before reading any file",
    (kind) => {
      const { manifest, read } = fixture();
      if (kind === "swap") {
        [manifest.migrations[0], manifest.migrations[1]] = [
          manifest.migrations[1],
          manifest.migrations[0],
        ];
      } else if (kind === "chronological") {
        manifest.migrations.sort((a, b) =>
          a.filename.localeCompare(b.filename)
        );
        manifest.migrations.forEach((entry, i) => {
          entry.sequence = i + 1;
        });
      } else if (kind === "sequence") {
        manifest.migrations[0].sequence = 2;
      } else if (kind === "duplicate") {
        manifest.migrations[1].filename = manifest.migrations[0].filename;
      } else {
        manifest.migrations[0].filename = "20261001000000_unreviewed.sql";
      }
      expect(checkProductionSchemaManifest(manifest, read)).toMatchObject({
        status: "BLOCKED",
        checkedFiles: 0,
        issues: [{ code: "ORDER_MISMATCH" }],
      });
      expect(read).not.toHaveBeenCalled();
    }
  );

  it.each(["missing", "extra", "candidate", "hash", "path", "mode", "field"])(
    "rejects invalid %s metadata before reading files",
    (kind) => {
      const { manifest, read } = fixture();
      const input = JSON.parse(JSON.stringify(manifest));
      if (kind === "missing") input.migrations.pop();
      if (kind === "extra") input.migrations.push(input.migrations[0]);
      if (kind === "candidate") input.candidateCommit = "0".repeat(40);
      if (kind === "hash") input.migrations[0].sha256 = "not-a-sha256";
      if (kind === "path") input.migrations[0].filename = "../../.env";
      if (kind === "mode") input.mode = "apply";
      if (kind === "field") input.databaseUrl = "synthetic forbidden field";
      expect(checkProductionSchemaManifest(input, read)).toMatchObject({
        status: "BLOCKED",
        checkedFiles: 0,
        issues: [{ code: "MANIFEST_INVALID" }],
      });
      expect(read).not.toHaveBeenCalled();
    }
  );

  it("never includes raw reader errors or SQL contents in its report", () => {
    const { manifest } = fixture();
    const result = checkProductionSchemaManifest(manifest, () => {
      throw new Error("synthetic-private-reader-diagnostic");
    });
    expect(result.status).toBe("BLOCKED");
    expect(JSON.stringify(result)).not.toContain(
      "synthetic-private-reader-diagnostic"
    );
  });

  it("defaults to worktree and requires explicit candidate selection", () => {
    expect(parseStaticCheckSource([])).toBe("worktree");
    expect(parseStaticCheckSource(["--source=worktree"])).toBe("worktree");
    expect(parseStaticCheckSource(["--source=candidate"])).toBe("candidate");
  });

  it.each([
    ["--apply"],
    ["--connect"],
    ["--dry-run"],
    ["--source=remote"],
    ["--source=candidate", "--apply"],
    ["--source=worktree", "--source=candidate"],
  ])("rejects unsupported arguments %j", (...args) => {
    expect(() => parseStaticCheckSource(args)).toThrow();
  });
});

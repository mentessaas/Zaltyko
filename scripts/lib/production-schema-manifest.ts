import { createHash } from "node:crypto";
import { z } from "zod";

import {
  E2E_DOMAIN_MIGRATIONS,
  E2E_LOCAL_OWNER_SIGNUP_MIGRATIONS,
  E2E_LOCAL_OWNER_MONTHLY_TARIFF_MIGRATIONS,
} from "./e2e-domain-migrations";

export const PRODUCTION_SCHEMA_CANDIDATE =
  "5d072d1902a8f735eae7c0ad6ef367adf09656dc";

// This composition does not change the sandbox runner's allowlist.
export const PRODUCTION_SCHEMA_ORDER = [
  ...E2E_DOMAIN_MIGRATIONS,
  ...E2E_LOCAL_OWNER_SIGNUP_MIGRATIONS,
  ...E2E_LOCAL_OWNER_MONTHLY_TARIFF_MIGRATIONS,
] as const;

const manifestSchema = z
  .object({
    formatVersion: z.literal(1),
    candidateCommit: z.literal(PRODUCTION_SCHEMA_CANDIDATE),
    mode: z.literal("static-only"),
    migrations: z
      .array(
        z
          .object({
            sequence: z.number().int().positive(),
            filename: z.string().regex(/^\d{14}_[a-z0-9_]+\.sql$/),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict()
      )
      .length(18),
  })
  .strict();

export type ProductionSchemaManifest = z.infer<typeof manifestSchema>;
export type MigrationReader = (filename: string) => Uint8Array;
export type StaticCheckSource = "worktree" | "candidate";

export type ManifestIssue = {
  code:
    | "MANIFEST_INVALID"
    | "ORDER_MISMATCH"
    | "FILE_UNAVAILABLE"
    | "CHECKSUM_MISMATCH";
  filename?: string;
};

export type ManifestCheck = {
  status: "PASS" | "BLOCKED";
  mode: "static-only";
  candidateCommit: string;
  checkedFiles: number;
  schemaReadiness: "NOT_VERIFIED";
  activationAllowed: false;
  issues: ManifestIssue[];
};

/** No environment, database, SQL execution or implicit migration discovery. */
export function checkProductionSchemaManifest(
  input: unknown,
  readMigration: MigrationReader
): ManifestCheck {
  const result: ManifestCheck = {
    status: "BLOCKED",
    mode: "static-only",
    candidateCommit: PRODUCTION_SCHEMA_CANDIDATE,
    checkedFiles: 0,
    schemaReadiness: "NOT_VERIFIED",
    activationAllowed: false,
    issues: [],
  };
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) {
    result.issues.push({ code: "MANIFEST_INVALID" });
    return result;
  }
  const entries = parsed.data.migrations;
  if (
    PRODUCTION_SCHEMA_ORDER.length !== 18 ||
    entries.some(
      (entry, index) =>
        entry.sequence !== index + 1 ||
        entry.filename !== PRODUCTION_SCHEMA_ORDER[index]
    )
  ) {
    result.issues.push({ code: "ORDER_MISMATCH" });
    return result;
  }

  for (const entry of entries) {
    try {
      // Hash exact bytes: never trim or normalize line endings.
      const actual = createHash("sha256")
        .update(readMigration(entry.filename))
        .digest("hex");
      result.checkedFiles += 1;
      if (actual !== entry.sha256) {
        result.issues.push({
          code: "CHECKSUM_MISMATCH",
          filename: entry.filename,
        });
      }
    } catch {
      // Do not expose reader errors: they may contain environment values.
      result.issues.push({
        code: "FILE_UNAVAILABLE",
        filename: entry.filename,
      });
    }
  }
  result.status = result.issues.length === 0 ? "PASS" : "BLOCKED";
  return result;
}

export function parseStaticCheckSource(args: string[]): StaticCheckSource {
  if (args.length === 0) return "worktree";
  if (args.length === 1 && args[0] === "--source=worktree") return "worktree";
  if (args.length === 1 && args[0] === "--source=candidate") return "candidate";
  throw new Error("Only --source=worktree or --source=candidate is supported.");
}

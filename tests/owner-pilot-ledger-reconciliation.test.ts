import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Fixed-source regression only: not a general SQL parser or execution approval.
const source = readFileSync(
  new URL(
    "../scripts/sql/owner-pilot-ledger-reconciliation.sql",
    import.meta.url
  ),
  "utf8"
);
const manifest = JSON.parse(
  readFileSync(
    new URL(
      "../docs/deployment/production-schema-manifest-5d072d19.json",
      import.meta.url
    ),
    "utf8"
  )
);

describe("fixed deployment-history comparison SQL", () => {
  it("uses precisely the 18 approved filenames, versions and hashes in explicit order", () => {
    const tuples = [
      ...source.matchAll(
        /\((\d+), '([^']+)', '([0-9]{14})', '([a-f0-9]{64})'\)/g
      ),
    ];
    expect(
      tuples.map(([, sequence, filename, version, sha256]) => ({
        sequence: Number(sequence),
        filename,
        version,
        sha256,
      }))
    ).toEqual(
      manifest.migrations.map(
        (migration: {
          sequence: number;
          filename: string;
          sha256: string;
        }) => ({
          ...migration,
          version: migration.filename.split("_")[0],
        })
      )
    );
    expect(tuples).toHaveLength(18);
  });

  it("compares only the fixed private history relation and returns booleans/counts, not stored values", () => {
    const sql = source.replace(/^--.*$/gm, "");
    expect(
      sql.match(/zaltyko_domain_private\.e2e_schema_migrations/g)
    ).toHaveLength(2);
    expect(sql).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|COPY|CALL|DO|GRANT|REVOKE|TRUNCATE)\b/i
    );
    expect(sql).not.toMatch(
      /\b(?:applied_at|auth|invoice_lines|payments|organizations)\b/i
    );
    expect(sql).toContain("pg_catalog.bool_and(l.version = e.version)");
    expect(sql).toContain("pg_catalog.bool_and(l.checksum = e.checksum)");
    expect(sql).toContain("pg_catalog.count(l.filename)");
    expect(sql.match(/;/g)).toHaveLength(1);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve("scripts/sql/owner-pilot-catalog-preflight.sql"),
  "utf8"
);
const uncomment = (value: string) => value.replace(/--[^\n]*/g, "");
const statements = uncomment(sql)
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

// Narrow static regression guard for this checked-in artifact, not a SQL parser
// or a validator for arbitrary SQL supplied by a user. No DB runner is imported.
function assertCatalogOnly(input: string) {
  const code = uncomment(input);
  const withoutLiterals = code.replace(/'(?:[^']|'')*'/g, "''");
  const parts = code
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (!/^SELECT\b/i.test(part) || !/\bLIMIT\s+\d+\s*$/i.test(part)) {
      throw new Error("Only bounded SELECT statements are permitted");
    }
  }
  if (
    /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|COPY|CALL|DO|EXECUTE|INTO|SET|BEGIN|COMMIT|ROLLBACK)\b/i.test(
      withoutLiterals
    )
  ) {
    throw new Error("Mutation or transaction control");
  }
  if (/\bSELECT\s+(?:[a-z]+\.)?\*/i.test(code))
    throw new Error("Wildcard output");

  const catalogs = new Set([
    "pg_namespace",
    "pg_roles",
    "pg_class",
    "pg_attribute",
    "pg_type",
    "pg_constraint",
    "pg_index",
    "pg_am",
    "pg_policy",
    "pg_proc",
    "pg_extension",
    "unnest",
    "aclexplode",
  ]);
  for (const match of code.matchAll(
    /\b(?:FROM|JOIN)\s+(?:LATERAL\s+)?([a-z_][a-z_0-9]*)(?:\.([a-z_][a-z_0-9]*))?/gi
  )) {
    if (match[1] !== "pg_catalog" || !catalogs.has(match[2])) {
      throw new Error("Non-allowlisted catalog source");
    }
  }
  const functions = new Set([
    "count",
    "has_schema_privilege",
    "has_table_privilege",
    "current_schemas",
    "unnest",
    "cardinality",
    "aclexplode",
    "acldefault",
  ]);
  for (const match of code.matchAll(/\bpg_catalog\.([a-z_]+)\s*\(/gi)) {
    if (!functions.has(match[1])) throw new Error("Non-allowlisted function");
  }
  if (
    /\b(?:prosrc|proconfig|prosqlbody|proargdefaults|rolpassword|rolconfig|adbin|nspacl|relacl::text|pg_get_[a-z_]+|current_setting)\b/i.test(
      code
    )
  ) {
    throw new Error("Sensitive content or deparser");
  }
  if (
    /\b(?:polqual|polwithcheck|conbin|indexprs|indpred)\b(?!\s+IS\s+NOT\s+NULL)/i.test(
      code
    )
  ) {
    throw new Error("Expression contents exposed");
  }
  const identityRedacted = code.replace(
    /\bCURRENT_USER\s*=\s*SESSION_USER\b/gi,
    "role_equality"
  );
  if (
    /\b(?:CURRENT_USER|SESSION_USER|CURRENT_ROLE)\s*(?:,|AS\b|FROM\b)/i.test(
      identityRedacted
    )
  ) {
    throw new Error("Identity output");
  }
  const redactedRoles = code.replace(
    /r\.rolname\s*=\s*(?:CURRENT_USER|'anon'|'authenticated'|'service_role')/gi,
    "role_filter"
  );
  if (/\brolname\b/i.test(redactedRoles)) throw new Error("Role name output");
}

describe("Owner catalog preflight: local static contract", () => {
  it("contains ten bounded catalog-only SELECTs", () => {
    expect(statements).toHaveLength(10);
    expect(() => assertCatalogOnly(sql)).not.toThrow();
  });

  it("scopes structural inventories and makes truncation observable", () => {
    for (const statement of statements.slice(2, 9)) {
      expect(statement).toMatch(
        /WHERE n\.nspname IN \('public', 'auth', 'zaltyko', 'zaltyko_domain_private'\)/
      );
      expect(statement).toMatch(
        /pg_catalog\.count\(\*\) OVER \(\) AS total_rows/i
      );
      const limit = Number(statement.match(/LIMIT\s+(\d+)$/i)?.[1]);
      expect(limit).toBeGreaterThan(0);
      expect(limit).toBeLessThanOrEqual(12000);
    }
  });

  it("returns only approved extension identities and redacts other roles", () => {
    expect(statements[9]).toContain("(VALUES ('btree_gist'), ('pgcrypto'))");
    expect(statements[7]).toContain(
      "ELSE 'OTHER_REDACTED' END AS role_category"
    );
    expect(statements[1]).not.toMatch(/current_setting|rolname\s+AS/i);
  });

  it.each([
    "SELECT id FROM auth.users LIMIT 1;",
    "SELECT version, checksum FROM public.zaltyko_schema_migrations LIMIT 18;",
    "SELECT * FROM pg_catalog.pg_roles LIMIT 1;",
    "SELECT prosrc FROM pg_catalog.pg_proc LIMIT 1;",
    "SELECT proconfig FROM pg_catalog.pg_proc LIMIT 1;",
    "SELECT p.polqual FROM pg_catalog.pg_policy p LIMIT 1;",
    "SELECT CURRENT_USER AS identity FROM pg_catalog.pg_roles LIMIT 1;",
    "SELECT r.rolname FROM pg_catalog.pg_roles r LIMIT 1;",
    "SELECT pg_catalog.current_setting('search_path') LIMIT 1;",
    "SELECT pg_catalog.pg_get_functiondef(1) LIMIT 1;",
    "SELECT pg_catalog.pg_read_file('synthetic') LIMIT 1;",
    "SELECT 1; DROP SCHEMA zaltyko;",
    "SELECT 1 INTO temporary_result FROM pg_catalog.pg_class LIMIT 1;",
    "SELECT 1 FROM pg_catalog.pg_class;",
  ])("blocks prohibited output/source/operation: %s", (unsafeSql) => {
    expect(() => assertCatalogOnly(unsafeSql)).toThrow();
  });
});

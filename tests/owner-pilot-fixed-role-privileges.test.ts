import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const raw = readFileSync(
  new URL(
    "../scripts/sql/owner-pilot-fixed-role-privileges.sql",
    import.meta.url
  ),
  "utf8"
);
const sql = raw.replace(/--[^\n]*/g, "");

describe("fixed catalog-only role evidence contract", () => {
  it("has three fixed SELECT statements and no transaction/execution wrapper", () => {
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements).toHaveLength(3);
    for (const statement of statements)
      expect(statement).toMatch(/^WITH expected\(role_category\) AS/);
    expect(sql).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|DO|CALL|EXECUTE|COPY|SET|BEGIN|COMMIT|ROLLBACK)\b(?!')/i
    );
    expect(raw).toContain(
      "independently establish READ ONLY and a 10s timeout"
    );
  });
  it("reads only builtin catalogs or fixed CTEs", () => {
    const sources = [...sql.matchAll(/\b(?:FROM|JOIN)\s+([a-z_][\w.]*)/gi)].map(
      (m) => m[1]
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources)
      expect([
        "expected",
        "namespaces",
        "targets",
        "pg_catalog.pg_roles",
        "pg_catalog.pg_namespace",
        "pg_catalog.pg_class",
      ]).toContain(source);
    expect(sql).not.toMatch(
      /\b(?:auth|public|zaltyko|zaltyko_domain_private)\./
    );
    expect(sql).not.toMatch(/SELECT\s+\*/i);
  });
  it("allows only technical roles and three bounded result sets", () => {
    expect(
      sql.match(/VALUES \('anon'\), \('authenticated'\), \('service_role'\)/g)
    ).toHaveLength(3);
    expect([...sql.matchAll(/LIMIT (\d+)/g)].map((m) => Number(m[1]))).toEqual([
      3, 6, 24,
    ]);
    expect(sql).not.toMatch(
      /CURRENT_USER|SESSION_USER|rolpassword|rolconfig|pg_authid|pg_auth_members/
    );
    expect(sql).not.toMatch(/r\.rolname\s+(?:AS|,)/i);
  });
  it("keeps absence distinct from privilege denial", () => {
    expect(sql).not.toMatch(/COALESCE/i);
    expect(
      sql.match(/CASE WHEN r\.oid IS NOT NULL AND (?:n|c)\.oid IS NOT NULL/g)
    ).toHaveLength(13);
    expect(sql).toContain("role_exists");
    expect(sql).toContain("schema_exists");
    expect(sql).toContain("relation_exists");
  });
  it("checks effective privileges including column grants without policy bodies", () => {
    for (const name of [
      "has_schema_privilege",
      "has_table_privilege",
      "has_any_column_privilege",
      "pg_has_role",
    ])
      expect(sql).toContain(`pg_catalog.${name}(r.oid,`);
    for (const field of [
      "rls_enabled",
      "rls_forced",
      "role_owns_relation",
      "role_bypassrls",
      "role_superuser",
      "role_inherits",
      "any_column_select",
      "any_column_insert",
      "any_column_update",
    ])
      expect(sql).toContain(field);
    expect(sql).not.toMatch(
      /pg_get_|pg_policy|polqual|polwithcheck|prosrc|proconfig|pg_proc|pg_defacl|pg_read_file|set_config|dblink|json/i
    );
  });
});

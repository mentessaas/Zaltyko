import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const raw = readFileSync(
  new URL("../scripts/sql/owner-pilot-version-extensions.sql", import.meta.url),
  "utf8"
);
const sql = raw.replace(/--[^\n]*/g, "").trim();

describe("fixed version/extension evidence", () => {
  it("has one SELECT statement and one top-level JSON result", () => {
    expect(sql.split(";").filter((s) => s.trim())).toHaveLength(1);
    expect(sql).toMatch(/^SELECT pg_catalog\.jsonb_build_object\(/);
    expect(sql).toMatch(/\) AS version_extension_evidence;$/);
    expect(sql.match(/AS version_extension_evidence/g)).toHaveLength(1);
    expect(raw).toContain("READ ONLY and a 10s statement timeout");
  });
  it("returns only numeric server version rather than a free build string", () => {
    expect(sql).toContain(
      "pg_catalog.current_setting('server_version_num')::integer"
    );
    expect(sql.match(/current_setting\(/g)).toHaveLength(1);
    expect(sql).not.toMatch(
      /\bversion\s*\(|current_user|session_user|current_database|pg_settings/i
    );
  });
  it("restricts the extension set to three fixed names and deterministic order", () => {
    expect(sql).toContain("VALUES ('ltree'), ('pgcrypto'), ('btree_gist')");
    expect(sql).toContain("'extension_name', expected.extension_name");
    expect(sql).toContain("ORDER BY expected.extension_name");
    expect(sql).not.toMatch(/'extension_name',\s*e\.extname/);
  });
  it("reads only extension/namespace catalogs without user data or bodies", () => {
    expect(
      [...sql.matchAll(/(?:LEFT )?JOIN\s+(\w+\.\w+)/g)].map((m) => m[1])
    ).toEqual(["pg_catalog.pg_extension", "pg_catalog.pg_namespace"]);
    expect(sql).not.toMatch(
      /SELECT\s+\*|pg_class|pg_index|pg_proc|pg_policy|pg_auth|pg_get_|prosrc|polqual|extconfig|extcondition|pg_read_file|dblink/i
    );
    expect(sql).not.toMatch(
      /\b(?:public|auth|zaltyko|zaltyko_domain_private)\./
    );
  });
  it("emits only a closed schema category, not namespace strings", () => {
    expect(
      [...sql.matchAll(/THEN '(public|extensions|pg_catalog)'/g)].map(
        (m) => m[1]
      )
    ).toEqual(["public", "extensions", "pg_catalog"]);
    expect(sql).toContain("ELSE 'OTHER_REDACTED' END");
    expect(sql).not.toMatch(/THEN n\.nspname|ELSE n\.nspname/);
  });
  it("distinguishes absence and suppresses arbitrary extension-version strings", () => {
    expect(sql).toContain("'extension_exists', e.oid IS NOT NULL");
    expect(sql).toContain("CASE WHEN e.oid IS NULL THEN NULL");
    expect(sql).toContain("e.extversion ~ '^[0-9]+([.][0-9]+)*$'");
    expect(sql.match(/length\(e\.extversion\) <= 64/g)).toHaveLength(2);
    expect(sql).toContain(
      "'version_format_valid', CASE WHEN e.oid IS NOT NULL"
    );
    expect(sql).not.toContain("COALESCE");
  });
  it("contains no writes, dynamic SQL, helper creation or transaction wrapper", () => {
    expect(sql).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|EXECUTE|DO|CALL|COPY|BEGIN|COMMIT|ROLLBACK|SET)\b/i
    );
    expect(sql).not.toMatch(/query_to_xml|format\(|set_config|pg_temp|\$\$/i);
  });
});

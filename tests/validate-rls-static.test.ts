import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractPoliciesFromSource,
  extractRlsTablesFromSource,
  extractSchemaTablesFromSource,
  validateRLS,
  validateRLSFromSources,
} from "../scripts/validate-rls";

const schemaSource = `
// pgTable("comment_only", { organizationId: uuid("organization_id") })
/* zaltyko.table("also_comment_only", { tenantId: uuid("tenant_id") }) */
import { pgSchema, pgTable } from "drizzle-orm/pg-core";
const zaltyko = pgSchema("zaltyko");
export const publicShared = pgTable("shared", {
  organizationId: uuid("organization_id"),
});
export const publicCatalog = pgTable("catalog", {
  label: text("label").default("organizationId: is text, not a column key"),
});
export const zaltykoShared = zaltyko.table("shared", {
  organizationId: uuid("organization_id"),
});
const authUsers = pgSchema("auth").table("users", { id: uuid("id") });
`;

describe("inventario estático RLS por identidad de esquema y tabla", () => {
  it("detecta tablas public y zaltyko con el mismo nombre y omite declaraciones comentadas", () => {
    const tables = extractSchemaTablesFromSource(schemaSource, "schema.fixture.ts");

    expect(tables.map(({ schema, table, tenantScoped }) => ({ schema, table, tenantScoped }))).toEqual([
      { schema: "auth", table: "users", tenantScoped: false },
      { schema: "public", table: "catalog", tenantScoped: false },
      { schema: "public", table: "shared", tenantScoped: true },
      { schema: "zaltyko", table: "shared", tenantScoped: true },
    ]);
  });

  it("resuelve el pgSchema exportado e inventaría las diez tablas SaaS de su módulo consumidor", () => {
    const tables = [
      "organization_saas_customers",
      "organization_saas_checkout_operations",
      "organization_saas_trials",
      "organization_saas_subscriptions",
      "organization_entitlements",
      "organization_entitlement_changes",
      "organization_saas_webhook_events",
      "organization_saas_webhook_payload_conflicts",
      "organization_saas_webhook_reconciliation_decisions",
      "organization_saas_webhook_reconciliation_results",
    ];
    const coreSource = {
      name: "src/db/schema/zaltyko-core.ts",
      content: 'export const zaltyko = pgSchema("zaltyko");',
    };
    const billingSource = {
      name: "src/db/schema/zaltyko-saas-billing.fixture.ts",
      content: `import { zaltyko as billingSchema } from "./zaltyko-core";\n${tables
        .map(name => `billingSchema.table("${name}", { organizationId: uuid("organization_id") });`)
        .join("\n")}`,
    };
    const result = validateRLSFromSources([coreSource, billingSource], [
      { name: "synthetic.sql", content: "" },
    ]);

    expect(result.tenantTables.map(({ schema, table }) => `${schema}.${table}`)).toEqual(
      tables.map(name => `zaltyko.${name}`).sort()
    );
  });

  it("inventaría las diez tablas tenant del schema SaaS actual", () => {
    const billingSchema = readFileSync(
      resolve(process.cwd(), "src/db/schema/zaltyko-saas-billing.ts"),
      "utf8"
    );
    const coreSchema = readFileSync(resolve(process.cwd(), "src/db/schema/zaltyko-core.ts"), "utf8");
    const result = validateRLSFromSources(
      [
        { name: "src/db/schema/zaltyko-core.ts", content: coreSchema },
        { name: "src/db/schema/zaltyko-saas-billing.ts", content: billingSchema },
      ],
      [{ name: "synthetic.sql", content: "" }]
    );

    expect(result.tenantTables
      .filter(table => table.schema === "zaltyko" && table.file === "src/db/schema/zaltyko-saas-billing.ts")
      .map(table => table.table)).toEqual([
      "organization_entitlement_changes",
      "organization_entitlements",
      "organization_saas_checkout_operations",
      "organization_saas_customers",
      "organization_saas_subscriptions",
      "organization_saas_trials",
      "organization_saas_webhook_payload_conflicts",
      "organization_saas_webhook_reconciliation_decisions",
      "organization_saas_webhook_reconciliation_results",
      "organization_saas_webhook_events",
    ].sort());
  });

  it("no satisface la tabla zaltyko con RLS ni policy de public y descarta SQL comentado", () => {
    const sql = `
-- ALTER TABLE zaltyko.shared ENABLE ROW LEVEL SECURITY;
/* CREATE POLICY "fake" ON zaltyko.shared USING (true); */
/* outer comment /* nested fake ALTER TABLE zaltyko.shared ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "nested_fake" ON zaltyko.shared USING (true); */ still commented */
SELECT 'CREATE POLICY "string_fake" ON zaltyko.shared USING (true);';
SELECT $$ALTER TABLE zaltyko.shared ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dollar_fake" ON zaltyko.shared USING (true);$$;
ALTER TABLE public.shared ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_shared_read" ON shared USING (true);
`;
    const policies = extractPoliciesFromSource(sql, "synthetic.sql");
    const rlsTables = extractRlsTablesFromSource(sql);
    const result = validateRLSFromSources(
      [{ name: "schema.fixture.ts", content: schemaSource }],
      [{ name: "synthetic.sql", content: sql }]
    );

    expect(policies.map(({ schema, table }) => `${schema}.${table}`)).toEqual(["public.shared"]);
    expect(rlsTables).toEqual(new Set([JSON.stringify(["public", "shared"])]));
    expect(result.missingRls.map(({ schema, table }) => `${schema}.${table}`)).toEqual(["zaltyko.shared"]);
    expect(result.missingPolicies.map(({ schema, table }) => `${schema}.${table}`)).toEqual(["zaltyko.shared"]);
    expect(result.success).toBe(false);
  });

  it("pasa solo cuando cada identidad tenant tiene su RLS y policy en su schema", () => {
    const sql = `
ALTER TABLE public.shared ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_shared_read" ON public.shared USING (true);
ALTER TABLE "zaltyko"."shared" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zal_shared_read" ON "zaltyko"."shared" USING (true);
`;
    const result = validateRLSFromSources(
      [{ name: "schema.fixture.ts", content: schemaSource }],
      [{ name: "rls-consolidated.sql", content: sql }]
    );

    expect(result.success).toBe(true);
    expect(result.coverage).toBe(100);
    expect(result.policyTables).toEqual(["public.shared", "zaltyko.shared"]);
  });

  it("falla si faltan fuentes SQL aunque exista inventario sintético", () => {
    const result = validateRLSFromSources(
      [{ name: "schema.fixture.ts", content: schemaSource }],
      [],
      ["Error reading rls-consolidated.sql: ENOENT", "Required SQL source not found: migrations/"]
    );

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([
      "Error reading rls-consolidated.sql: ENOENT",
      "Required SQL source not found: migrations/",
    ]);
    expect(result.missingRls.map(({ schema, table }) => `${schema}.${table}`)).toEqual([
      "public.shared",
      "zaltyko.shared",
    ]);
  });

  it("falla si falta el árbol de schema, además de las fuentes SQL", () => {
    const root = mkdtempSync(join(tmpdir(), "validate-rls-missing-schema-"));
    try {
      const result = validateRLS(root);

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Required schema source not found: src/db/schema/");
      expect(result.errors).toContain("Required SQL source not found: migrations/");
      expect(result.errors.some(error => error.includes("rls-consolidated.sql"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("devuelve inventario negativo cuando los comentarios son la única fuente aparente", () => {
    const tables = extractSchemaTablesFromSource(
      `// pgTable("ignored", { organizationId: uuid("organization_id") })\n/*\npgSchema("zaltyko").table("ignored", { tenantId: uuid("tenant_id") })\n*/\nconst fake = 'pgTable("string_only", { organizationId: uuid("organization_id") })';`,
      "comments-only.fixture.ts"
    );

    expect(tables).toEqual([]);
  });

  it("no pasa con SQL aparentemente válido si los comentarios o un schema no resuelto dejan inventario tenant vacío", () => {
    const schema = `
/* const zaltyko = pgSchema("zaltyko");
   zaltyko.table("fake", { organizationId: uuid("organization_id") }); */
const unresolvedSchema = missingSchema.table("fake", {
  organizationId: uuid("organization_id"),
});
`;
    const sql = `
ALTER TABLE public.fake ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fake_read" ON public.fake USING (true);
`;
    const result = validateRLSFromSources(
      [{ name: "schema/unresolved.fixture.ts", content: schema }],
      [{ name: "synthetic.sql", content: sql }]
    );

    expect(result.tenantTables).toEqual([]);
    expect(result.coverage).toBe(0);
    expect(result.errors).toContain(
      "No tenant-scoped schema tables found; RLS coverage cannot pass with an empty inventory."
    );
    expect(result.success).toBe(false);
  });
});

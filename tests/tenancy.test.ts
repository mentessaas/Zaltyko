import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Tenant isolation contracts", () => {
  it("checks tenant before consulting grants for a dynamic resource", () => {
    const scope = read("src/lib/authz/resource-scope.ts");
    expect(scope).toContain("resourceTenantId !== context.tenantId");
    expect(scope.indexOf("resourceTenantId !== context.tenantId")).toBeLessThan(
      scope.indexOf("hasPermission(")
    );
  });

  it("keeps cross-academy communication rows behind member/manager RLS", () => {
    const migration = read(
      "supabase/migrations/20260716214500_day3_communication_academy_scope.sql"
    );
    expect(migration).toContain("zaltyko_private.is_academy_member(academy_id)");
    expect(migration).toContain("zaltyko_private.is_academy_manager(academy_id)");
    expect(migration).not.toMatch(/CREATE POLICY[^;]+tenant_id = get_current_tenant/s);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("communication resource academy scope", () => {
  it("models academy ownership on every mutable communication resource", () => {
    const schema = read("src/db/schema/communication.ts");
    expect(schema.match(/academyId: uuid\("academy_id"\)/g)).toHaveLength(3);
    expect(schema).toContain("message_templates_academy_idx");
    expect(schema).toContain("message_groups_academy_idx");
    expect(schema).toContain("scheduled_notifications_academy_idx");
  });

  it("scopes collection reads by tenant and academy", () => {
    const service = read("src/lib/communication-service.ts");
    expect(service).toContain("eq(messageGroups.academyId, academyId)");
    expect(service).toContain("eq(scheduledNotifications.academyId, academyId)");
    expect(service).toContain("eq(messageTemplates.academyId, filters.academyId)");
    expect(service).toContain("eq(messageTemplates.isSystem, true)");
  });

  it("authorizes dynamic IDs against the resource academy", () => {
    for (const route of [
      "src/app/api/communication/groups/[groupId]/route.ts",
      "src/app/api/communication/scheduled/[notificationId]/route.ts",
      "src/app/api/communication/templates/[templateId]/route.ts",
      "src/app/api/communication/templates/[templateId]/use/route.ts",
    ]) {
      const source = read(route);
      expect(source).toContain("authorizeAcademyCapability");
      expect(source).not.toContain("canManageCommunication");
      expect(source).not.toContain("canViewCommunication");
    }
  });

  it("keeps system templates read-only and rewrites RLS as academy scoped", () => {
    const migration = read(
      "supabase/migrations/20260716214500_day3_communication_academy_scope.sql"
    );
    expect(migration.match(/ADD COLUMN IF NOT EXISTS academy_id/g)).toHaveLength(3);
    expect(migration).toContain("HAVING count(*) = 1");
    expect(migration).toMatch(/academy_id IS NULL\s+AND is_system = true/);
    expect(migration.match(/CASE WHEN auth\.uid\(\) IS NULL THEN false/g)).toHaveLength(3);
    expect(migration.match(/FOR SELECT TO authenticated USING/g)).toHaveLength(3);
    expect(migration).toContain("zaltyko_private.is_academy_member(academy_id)");
    expect(migration).toContain("zaltyko_private.is_academy_manager(academy_id)");
    expect(migration).toContain("NO se aplicó a producción");
  });
});

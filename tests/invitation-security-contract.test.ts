import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("invitation security contract", () => {
  it("limits custom permissions and keeps only one pending invite per email", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/invitations/route.ts"), "utf8");
    const schema = readFileSync(join(process.cwd(), "src/db/schema/invitations.ts"), "utf8");
    const complete = readFileSync(join(process.cwd(), "src/app/api/invitations/complete/route.ts"), "utf8");
    expect(route).toContain("PERMISSION_ESCALATION");
    expect(route).toContain("INVITATION_ALREADY_PENDING");
    expect(schema).toContain("invitations_pending_email_tenant_unique");
    expect(complete).toContain("INVITATION_TENANT_CONFLICT");
  });

  it("targets the partial pending uniqueness constraint when resending admin invites", () => {
    const adminUsers = readFileSync(join(process.cwd(), "src/app/api/admin/users/route.ts"), "utf8");
    expect(adminUsers).toContain("where: sql`${invitations.status} = 'pending'`");
    expect(adminUsers).toContain("trim().toLowerCase()");
  });
});

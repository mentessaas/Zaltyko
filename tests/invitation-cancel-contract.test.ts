import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("team invitation cancellation", () => {
  it("cancels only pending invitations scoped to tenant and academy", () => {
    const source = readFileSync("src/app/api/invitations/[invitationId]/route.ts", "utf8");
    expect(source).toContain('export const DELETE');
    expect(source).toContain('eq(invitations.tenantId, context.tenantId)');
    expect(source).toContain('eq(invitations.defaultAcademyId, academyId)');
    expect(source).toContain('eq(invitations.status, "pending")');
    expect(source).toContain('set({ status: "cancelled" })');
  });
});

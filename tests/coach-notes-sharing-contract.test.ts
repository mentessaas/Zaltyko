import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("coach notes sharing contract", () => {
  it("validates note size and notifies linked guardians only within the tenant", () => {
    const create = readFileSync(join(process.cwd(), "src/app/api/coach-notes/route.ts"), "utf8");
    const update = readFileSync(join(process.cwd(), "src/app/api/coach-notes/[noteId]/route.ts"), "utf8");
    expect(create).toContain("createNotification");
    expect(create).toContain("eq(guardianAthletes.tenantId, context.tenantId)");
    expect(create).toContain("eq(guardians.tenantId, context.tenantId)");
    expect(create).toContain("max(10000)");
    expect(update).toContain("request.json().catch");
  });

  it("applies resource scope and filters parent reads to shared notes", () => {
    const source = readFileSync(join(process.cwd(), "src/app/api/coach-notes/route.ts"), "utf8");
    expect(source).toContain("authorizeAthleteResource");
    expect(source).toContain("authorizeAcademyCapability");
    expect(source).toContain("ATHLETE_REQUIRED_FOR_COACH");
    expect(source).toContain("onlySharedWithParents");
    expect(source).toContain("eq(coachNotes.sharedWithParents, true)");
    expect(source).toContain("eq(guardians.profileId, context.profile.id)");
  });
});

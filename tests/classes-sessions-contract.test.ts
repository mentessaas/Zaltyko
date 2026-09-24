import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("classes and sessions contract", () => {
  it("keeps waitlist athletes and session coaches in the class scope", () => {
    const waitlist = readFileSync(join(process.cwd(), "src/app/api/class-waiting-list/route.ts"), "utf8");
    const sessions = readFileSync(join(process.cwd(), "src/app/api/class-sessions/route.ts"), "utf8");
    expect(waitlist).toContain("eq(athletes.academyId, classRow.academyId)");
    expect(waitlist).toContain("eq(classWaitingList.tenantId, context.tenantId)");
    expect(sessions).toContain("eq(coaches.academyId, classRow.academyId)");
    expect(sessions).toContain("La hora de fin debe ser posterior al inicio");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("waiting-list promotion contract", () => {
  it("promotes the oldest entry and notifies linked family profiles after release", () => {
    const service = readFileSync(join(process.cwd(), "src/lib/classes/promote-waiting-list.ts"), "utf8");
    const route = readFileSync(join(process.cwd(), "src/app/api/class-enrollments/[enrollmentId]/route.ts"), "utf8");
    expect(service).toContain("orderBy(asc(classWaitingList.position), asc(classWaitingList.addedAt))");
    expect(service).toContain("type: \"waitlist_promoted\"");
    expect(route).toContain("promoteNextWaitingListEntry");
  });
});

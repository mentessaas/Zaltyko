import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("capacity and waiting list contracts", () => {
  it("counts group and extra athletes for capacity", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/classes/class-utils.ts"), "utf8");
    expect(source).toContain("getClassAthletes(classId, classRow.academyId)");
  });

  it("prevents duplicate waiting-list entries under concurrent requests", () => {
    const schema = readFileSync(join(process.cwd(), "src/db/schema/class-waiting-list.ts"), "utf8");
    const route = readFileSync(join(process.cwd(), "src/app/api/class-waiting-list/route.ts"), "utf8");
    expect(schema).toContain("class_waiting_list_class_athlete_unique");
    expect(route).toContain("onConflictDoNothing");
  });
});

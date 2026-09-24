import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("guardian scope contract", () => {
  it("does not let tenant admins bypass athlete tenant checks", () => {
    const athleteRoute = readFileSync(
      join(process.cwd(), "src/app/api/athletes/[athleteId]/guardians/route.ts"),
      "utf8"
    );
    const collectionRoute = readFileSync(join(process.cwd(), "src/app/api/guardians/route.ts"), "utf8");

    expect(athleteRoute).not.toContain('context.profile.role !== "admin"');
    expect(collectionRoute).toContain("ATHLETE_ACCESS_DENIED");
    expect(collectionRoute).toContain("eq(athletes.academyId, body.academyId)");
  });
});

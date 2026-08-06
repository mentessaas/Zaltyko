import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routes = [
  "src/app/api/athletes/[athleteId]/classes/route.ts",
  "src/app/api/athletes/[athleteId]/guardians/route.ts",
  "src/app/api/athletes/[athleteId]/route.ts",
  "src/app/api/athletes/route.ts",
  "src/app/api/billing/payment-method/route.ts",
  "src/app/api/billing/portal/route.ts",
  "src/app/api/classes/route.ts",
  "src/app/api/events/[id]/route.ts",
  "src/app/api/groups/[groupId]/route.ts",
  "src/app/api/groups/route.ts",
];

describe("rate-limited Route Handler context", () => {
  it("forwards Next.js params instead of replacing context with an empty object", () => {
    for (const route of routes) {
      const source = readFileSync(join(process.cwd(), route), "utf8");
      expect(source, route).not.toMatch(/Handler\(request, \{\} as (?:any|never)\)/);
      expect(source, route).toMatch(/async \(request, context\)/);
      expect(source, route).toMatch(/Handler\(request, context\)/);
    }
  });
});

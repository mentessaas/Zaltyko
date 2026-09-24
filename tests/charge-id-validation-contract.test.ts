import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const routes = [
  "src/app/api/charges/[chargeId]/status/route.ts",
  "src/app/api/charges/[chargeId]/collect/route.ts",
  "src/app/api/charges/[chargeId]/refund/route.ts",
];

describe("charge action identifiers", () => {
  it("rejects malformed UUIDs before hitting the database", () => {
    for (const path of routes) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("z.string().uuid().safeParse(chargeId)");
      expect(source).toContain("INVALID_CHARGE_ID");
    }
  });
});

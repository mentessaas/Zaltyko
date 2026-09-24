import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("communication academy authorization contract", () => {
  it("authorizes academy-scoped writes and history reads", () => {
    const files = [
      "src/app/api/communication/history/route.ts",
      "src/app/api/communication/groups/route.ts",
      "src/app/api/communication/templates/route.ts",
      "src/app/api/communication/scheduled/route.ts",
    ].map((file) => readFileSync(join(process.cwd(), file), "utf8"));
    for (const source of files) expect(source).toContain("authorizeAcademyCapability");
  });
});

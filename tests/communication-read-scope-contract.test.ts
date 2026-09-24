import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("communication read scope contract", () => {
  it("protects scheduled, group and template reads with academy capability", () => {
    for (const file of ["scheduled/route.ts", "groups/route.ts", "templates/route.ts"]) {
      const source = readFileSync(join(process.cwd(), "src/app/api/communication", file), "utf8");
      expect(source).toContain('permission: "communications:read"');
    }
  });
});

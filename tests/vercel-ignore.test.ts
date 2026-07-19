import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Vercel ignore rules", () => {
  it("keeps the API documentation route in the production source bundle", () => {
    const rules = readFileSync(resolve(process.cwd(), ".vercelignore"), "utf8")
      .split(/\r?\n/)
      .map((rule) => rule.trim());

    expect(rules).toContain("/docs/");
    expect(rules).not.toContain("docs");
  });
});

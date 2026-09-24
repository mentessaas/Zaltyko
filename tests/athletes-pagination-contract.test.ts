import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("athletes pagination contract", () => {
  it("counts distinct athletes when joining guardians", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/athletes/route.ts"),
      "utf8"
    );

    expect(source).toContain("count(distinct ${athletes.id})");
    expect(source).toContain("guardian_athletes puede producir varias filas");
  });
});

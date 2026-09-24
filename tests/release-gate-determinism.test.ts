import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("release gate determinism contract", () => {
  it("runs the shared integration suite with one worker", () => {
    const verifier = readFileSync("scripts/verify-production-ready.ts", "utf8");
    const vitestConfig = readFileSync("vitest.config.ts", "utf8");

    expect(verifier).toContain('"--maxWorkers=1"');
    expect(verifier).not.toContain('"--maxWorkers=2"');
    expect(vitestConfig).toContain("maxWorkers: 1");
  });
});

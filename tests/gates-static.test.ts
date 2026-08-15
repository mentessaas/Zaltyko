import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(process.cwd(), "scripts/gates");
const POSITIVE = path.join(ROOT, "__fixtures__", "positive");
const NEGATIVE = path.join(ROOT, "__fixtures__", "negative");

function runGate(script: string, root: string, strict = false) {
  return spawnSync(process.execPath, ["--import", "tsx", path.join(ROOT, script), "--root", root, ...(strict ? ["--strict"] : [])], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

describe("static gates fixture contracts", () => {
  it("A2 accepts the positive fixture", () => {
    expect(runGate("unbounded-reads.ts", POSITIVE).status).toBe(0);
  }, 15000);

  it("A2 rejects the negative fixture", () => {
    expect(runGate("unbounded-reads.ts", NEGATIVE, true).status).toBe(1);
  }, 15000);

  it("A3 accepts the positive fixture", () => {
    expect(runGate("auth-before-validate.ts", path.join(POSITIVE, "auth-order")).status).toBe(0);
  }, 15000);

  it("A3 rejects the negative fixture", () => {
    expect(runGate("auth-before-validate.ts", path.join(NEGATIVE, "auth-order"), true).status).toBe(1);
  }, 15000);
});

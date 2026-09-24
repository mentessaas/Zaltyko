import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const counters = readFileSync(
  join(process.cwd(), "src/lib/limits/resource-counters.ts"),
  "utf8",
);

describe("plan limits count only active records", () => {
  it("does not consume capacity with soft-deleted athletes, classes, or groups", () => {
    expect(counters).toContain("isNull(athletes.deletedAt)");
    expect(counters).toContain("isNull(classes.deletedAt)");
    expect(counters).toContain("isNull(groups.deletedAt)");
  });
});

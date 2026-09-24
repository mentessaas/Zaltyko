import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/dashboard/OperationsPulse.tsx", "utf8");

describe("operations pulse copy", () => {
  it("uses singular-aware labels instead of appending a fixed plural", () => {
    expect(source).toContain("currentLabel: (value) => (value === 1 ? \"gimnasta en la academia\"");
    expect(source).toContain("currentLabel: (value) => (value === 1 ? \"grupo activo\"");
    expect(source).toContain("{activeMetric.currentLabel(current ?? 0)}");
    expect(source).not.toContain("{activeMetric.label.toLowerCase()} actuales");
  });
});

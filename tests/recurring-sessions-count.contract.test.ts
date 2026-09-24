import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("recurring sessions indicator", () => {
  it("counts actual dates instead of flooring whole weeks", () => {
    const source = readFileSync("src/components/classes/RecurringSessionsManager.tsx", "utf8");
    expect(source).toContain("eachDayOfInterval");
    expect(source).toContain("date.getDay()");
    expect(source).not.toContain("Math.floor(daysDiff / 7)");
  });
});

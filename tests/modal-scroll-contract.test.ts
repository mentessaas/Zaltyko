import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("modal scroll contract", () => {
  it("keeps long forms inside the viewport without covering the footer", () => {
    const source = readFileSync("src/components/ui/modal.tsx", "utf8");

    expect(source).toContain("max-h-[calc(100dvh-2rem)]");
    expect(source).toContain("flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col overflow-hidden");
    expect(source).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(source).toContain("shrink-0 border-t");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("chat timeout resilience", () => {
  it("recognizes browser and Error abort variants", () => {
    const source = readFileSync("src/components/chat/ChatWidget.tsx", "utf8");
    expect(source).toContain("error instanceof Error && error.name === 'AbortError'");
    expect(source).toContain("error instanceof DOMException && error.name === 'AbortError'");
  });
});

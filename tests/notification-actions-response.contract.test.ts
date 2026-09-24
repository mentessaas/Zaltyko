import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("notification actions", () => {
  it("does not mutate local state when notification actions return HTTP errors", () => {
    const source = readFileSync("src/components/notifications/NotificationCenter.tsx", "utf8");
    expect(source).toContain('if (!response.ok) throw new Error("mark read failed")');
    expect(source).toContain('if (!response.ok) throw new Error("delete failed")');
    expect(source).toContain('if (!response.ok) throw new Error("batch delete failed")');
    expect(source).toContain('if (!response.ok) throw new Error("batch mark read failed")');
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("notification dispatcher email availability", () => {
  it("resolves email availability from auth users instead of disabling it", () => {
    const source = readFileSync("src/lib/notifications/dispatcher.ts", "utf8");
    expect(source).toContain("getAuthUserEmail(userId)");
    expect(source).toContain('isFeatureEnabled("whatsapp")');
    expect(source).not.toContain("return false;\n\n    case \"whatsapp\"");
  });
});

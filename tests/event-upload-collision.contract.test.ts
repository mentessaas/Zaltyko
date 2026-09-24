import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("event upload naming", () => {
  it("uses a UUID suffix so concurrent uploads cannot collide", () => {
    const source = readFileSync("src/app/api/events/upload/route.ts", "utf8");
    expect(source).toContain('import { randomUUID } from "node:crypto"');
    expect(source).toContain("`${Date.now()}-${randomUUID()}.${fileExt}`");
  });
});

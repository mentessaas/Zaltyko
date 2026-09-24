import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("class session idempotency contract", () => {
  it("enforces one session per class and date and reports actual inserts", () => {
    const schema = readFileSync(join(process.cwd(), "src/db/schema/class-sessions.ts"), "utf8");
    const route = readFileSync(join(process.cwd(), "src/app/api/class-sessions/route.ts"), "utf8");
    const generator = readFileSync(join(process.cwd(), "src/lib/generate-class-sessions.ts"), "utf8");
    expect(schema).toContain("class_sessions_class_date_unique");
    expect(route).toContain("onConflictDoNothing");
    expect(route).toContain("created: false");
    expect(generator).toContain("generated = inserted.length");
  });
});

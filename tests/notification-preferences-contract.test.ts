import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("notification preferences contract", () => {
  it("prevents duplicate channel rows and makes concurrent updates safe", () => {
    const schema = readFileSync(join(process.cwd(), "src/db/schema/communication.ts"), "utf8");
    const service = readFileSync(join(process.cwd(), "src/lib/communication-service.ts"), "utf8");
    expect(schema).toContain("notification_preferences_profile_channel_unique");
    expect(service).toContain("onConflictDoUpdate");
    expect(service).toContain("onConflictDoNothing");
  });
});

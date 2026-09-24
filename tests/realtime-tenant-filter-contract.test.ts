import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Realtime tenant filters", () => {
  it("does not subscribe to cross-tenant academy, class or contact events", () => {
    const source = readFileSync("src/hooks/use-realtime-notifications.ts", "utf8");
    expect(source).toContain("table: \"academies\",");
    expect(source).toContain("table: \"classes\",");
    expect(source).toContain("table: \"contact_messages\",");
    expect(source.match(/filter: tenantId \? `tenant_id=eq\.\$\{tenantId\}`/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

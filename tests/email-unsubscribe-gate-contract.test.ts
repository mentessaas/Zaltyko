import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("global email unsubscribe gate", () => {
  it("enforces opt-out in the shared email sender", () => {
    const source = readFileSync("src/lib/email/email-service.ts", "utf8");
    expect(source).toContain("hasMarketingOptOut");
    expect(source).toContain("Email omitido: destinatario dado de baja");
  });
});

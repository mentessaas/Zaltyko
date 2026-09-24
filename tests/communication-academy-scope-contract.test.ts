import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("communication academy scope contract", () => {
  it("passes and applies academyId to history queries", () => {
    const service = readFileSync(
      join(process.cwd(), "src/lib/communication-service.ts"),
      "utf8"
    );
    const panel = readFileSync(
      join(process.cwd(), "src/components/communication/CommunicationHistory.tsx"),
      "utf8"
    );

    expect(service).toContain("messageHistory.meta}->>'academyId'");
    expect(panel).toContain('params.set("academyId", academyId)');
  });
});

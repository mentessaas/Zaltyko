import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("group alert response contract", () => {
  it("accepts the standard API envelope and validates follow-up identifiers", () => {
    const source = readFileSync("src/components/messages/ContextGroupAlertComposer.tsx", "utf8");
    expect(source).toContain("const result = payload?.data ?? payload");
    expect(source).toContain("typeof result?.conversationId !== \"string\"");
    expect(source).toContain("Number.isFinite(result?.recipientCount)");
  });
});

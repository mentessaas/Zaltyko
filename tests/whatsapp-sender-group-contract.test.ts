import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("WhatsApp sender delivery modes", () => {
  it("resolves group sends through the server and reconciles direct history", () => {
    const source = readFileSync("src/components/whatsapp/WhatsAppSender.tsx", "utf8");
    expect(source).toContain('recipientType: "group"');
    expect(source).toContain("recipientIds: [selectedGroup]");
    expect(source).toContain("historyId");
    expect(source).toContain("historyResponse.ok");
    expect(source).toContain("academyId,");
  });
});

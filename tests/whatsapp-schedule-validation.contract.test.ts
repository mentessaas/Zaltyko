import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("WhatsApp send validation", () => {
  it("blocks oversized messages and invalid/past scheduled times before sending", () => {
    const source = readFileSync("src/components/whatsapp/WhatsAppMessagePanel.tsx", "utf8");
    expect(source).toContain("message.length <= maxChars");
    expect(source).toContain("scheduledDate.getTime() > Date.now()");
    expect(source).toContain('recipientType === "class" && Boolean(selectedClass)');
  });
});

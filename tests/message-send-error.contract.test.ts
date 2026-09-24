import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("messaging error contract", () => {
  it("validates responses and preserves typed content when sending fails", () => {
    const page = readFileSync("src/components/messages/MessagesPage.tsx", "utf8");
    const input = readFileSync("src/components/messages/MessageInput.tsx", "utf8");
    expect(page).toContain("typeof result?.id !== \"string\"");
    expect(page).toContain("throw sendError");
    expect(input).toContain("setError(sendError instanceof Error");
    expect(input).toContain('role=\"alert\"');
  });
});

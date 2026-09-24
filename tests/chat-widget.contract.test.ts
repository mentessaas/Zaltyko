import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("chat widget contract", () => {
  it("keeps the input flexible and the send action named", () => {
    const source = readFileSync("src/components/chat/ChatWidget.tsx", "utf8");
    expect(source).toContain('<div className="min-w-0 flex-1">');
    expect(source).toContain('aria-label="Enviar mensaje al asistente"');
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("chat assistant product contract", () => {
  it("desempaqueta la respuesta API estandarizada y evita respuestas colgadas", () => {
    const source = read("src/components/chat/ChatWidget.tsx");
    expect(source).toContain("data?.data?.answer");
    expect(source).toContain("AbortController");
    expect(source).toContain("aria-busy");
  });

  it("mantiene una respuesta útil si el proveedor todavía no está provisionado", () => {
    const source = read("src/app/api/ai/communication/chat/route.ts");
    expect(source).toContain("!process.env.MINIMAX_API_KEY");
    expect(source).toContain("unavailableAssistantAnswer");
    expect(source).toContain('provider: "fallback"');
  });

  it("usa el endpoint y modelo vigentes de MiniMax y rechaza respuestas vacías", () => {
    const source = read("src/lib/ai/client.ts");
    expect(source).toContain("api.minimax.io/v1/text/chatcompletion_v2");
    expect(source).toContain("MiniMax-M2.7");
    expect(source).toContain("EMPTY_RESPONSE");
  });

  it("mantiene una respuesta accionable si el proveedor falla", () => {
    const source = read("src/app/api/ai/communication/chat/route.ts");
    expect(source).toContain("fallback_error");
    expect(source).toContain("AI provider unavailable; returning conversational fallback");
  });

  it("mantiene el asistente visible en el workspace moderno tras el redirect", () => {
    const source = read("src/app/app/[academyId]/layout.tsx");
    expect(source).toContain('import { ChatWidgetWrapper } from "@/components/chat/ChatWidgetWrapper"');
    expect(source).toContain("<ChatWidgetWrapper academyId={academy.id} />");
  });
});

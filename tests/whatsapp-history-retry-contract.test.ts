import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("WhatsApp retry safety contract", () => {
  it("retries only a message owned by the authenticated tenant and academy", () => {
    const route = read("src/app/api/whatsapp/send/route.ts");
    expect(route).toContain("HISTORY_NOT_FOUND");
    expect(route).toContain("eq(messageHistory.tenantId, context.tenantId)");
    expect(route).toContain("eq(messageHistory.academyId, academyId)");
    expect(route).toContain('eq(messageHistory.channel, "whatsapp")');
    expect(route).toContain('eq(messageHistory.direction, "outbound")');
    expect(route).toContain('eq(messageHistory.status, "failed")');
  });

  it("connects the failed-history action to the real send endpoint", () => {
    const history = read("src/components/whatsapp/WhatsAppHistory.tsx");
    const page = read("src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx");
    expect(history).toContain("onRetry?: (message: WhatsAppMessage) => Promise<boolean>");
    expect(history).toContain("Reintentar envío");
    expect(page).toContain('historyId: message.id');
    expect(page).toContain("onRetry={handleRetryMessage}");
  });
});

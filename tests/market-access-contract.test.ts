import { describe, expect, it } from "vitest";
import { ContactRequestSchema } from "@/lib/growth/contracts";
import { serializeMarketAccessMessage } from "@/lib/growth/market-access";

const request = {
  name: "Responsable sintético",
  email: "club@example.com",
  reason: "market_access",
  visitorId: "10000000-0000-4000-8000-000000000001",
  submissionId: "10000000-0000-4000-8000-000000000002",
  message: "Necesitamos gestionar clases y asistencia.",
  marketAccess: { countryName: "  Argentina  ", role: "owner", disciplines: ["rhythmic"] },
};

describe("solicitud de mercado asistido", () => {
  it("conserva el país indicado y la necesidad sin inventar academia, moneda o permiso de compra", () => {
    const parsed = ContactRequestSchema.parse(request);
    expect(parsed.marketAccess?.countryName).toBe("Argentina");
    const stored = JSON.parse(serializeMarketAccessMessage(parsed.marketAccess!, parsed.message));
    expect(stored).toEqual({
      kind: "market_access_request", version: 1, countryName: "Argentina", role: "owner",
      disciplines: ["rhythmic"], message: request.message,
    });
    expect(stored).not.toHaveProperty("organizationId");
    expect(stored).not.toHaveProperty("currency");
    expect(stored).not.toHaveProperty("launchNotifications");
  });

  it.each([
    undefined,
    { countryName: "", role: "owner", disciplines: ["rhythmic"] },
    { countryName: "Chile", role: "parent", disciplines: ["rhythmic"] },
    { countryName: "Chile", role: "owner", disciplines: [] },
    { countryName: "Chile", role: "owner", disciplines: ["rhythmic", "rhythmic"] },
    { countryName: "<b>Chile</b>", role: "owner", disciplines: ["rhythmic"] },
    { countryName: "Chile\nOtro valor", role: "owner", disciplines: ["rhythmic"] },
    { countryName: "Chile", role: "owner", disciplines: ["rhythmic"], athleteName: "No recoger" },
  ])("rechaza datos incompletos, desconocidos o contenido fuera del contrato: %j", (marketAccess) => {
    expect(ContactRequestSchema.safeParse({ ...request, marketAccess }).success).toBe(false);
  });

  it("no incorpora silenciosamente datos de mercado a otros motivos de contacto", () => {
    expect(ContactRequestSchema.safeParse({ ...request, reason: "support" }).success).toBe(false);
    const { marketAccess: _marketAccess, ...ordinary } = request;
    expect(ContactRequestSchema.safeParse({ ...ordinary, reason: "support" }).success).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  leads: { id: "lead-id", email: "lead-email" },
  interactions: {
    id: "interaction-id", leadId: "lead-id", submissionId: "submission-id",
    name: "name", email: "email", academy: "academy", reason: "reason",
    plan: "plan", source: "source", message: "message", visitorId: "visitor-id",
  },
  transaction: vi.fn(), execute: vi.fn(),
  insert: vi.fn(), select: vi.fn(), mail: vi.fn(), event: vi.fn(),
  leadValues: [] as Record<string, unknown>[],
  interactionValues: [] as Record<string, unknown>[],
  seen: new Set<string>(),
}));
vi.mock("@/db", () => ({ db: { transaction: state.transaction } }));
vi.mock("drizzle-orm", () => ({ eq: (_column: unknown, value: unknown) => value, sql: (...args: unknown[]) => args }));
vi.mock("@/db/schema", () => ({ leads: state.leads, leadInteractions: state.interactions }));
vi.mock("@/lib/rate-limit", () => ({ withRateLimit: (handler: (request: NextRequest) => Promise<Response>) => handler }));
vi.mock("@/lib/directory/contracts", () => ({ flag: () => false }));
vi.mock("@/lib/growth/events", () => ({ recordGrowthEvent: state.event }));
vi.mock("@/lib/email/email-service", () => ({ sendEmailWithLogging: state.mail }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import { POST } from "@/app/api/contact/route";

const body = {
  name: "Responsable sintético", email: "club@example.com", reason: "market_access",
  visitorId: "10000000-0000-4000-8000-000000000001",
  submissionId: "10000000-0000-4000-8000-000000000002",
  message: "Necesitamos gestionar clases y asistencia.",
  marketAccess: { countryName: "Argentina", role: "owner", disciplines: ["rhythmic"] },
};
function request(value: unknown) {
  return new NextRequest("https://synthetic.invalid/api/contact", {
    method: "POST", body: JSON.stringify(value), headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  state.insert.mockReset(); state.select.mockReset(); state.mail.mockReset(); state.event.mockReset();
  state.transaction.mockReset(); state.execute.mockReset();
  state.leadValues.length = 0; state.interactionValues.length = 0; state.seen.clear();
  state.mail.mockResolvedValue(undefined); state.event.mockResolvedValue(undefined);
  state.execute.mockResolvedValue(undefined);
  state.transaction.mockImplementation(async (action) => action({ insert: state.insert, select: state.select, execute: state.execute }));
  state.select.mockReturnValue({ from: (table: unknown) => ({ where: (key: unknown) => ({ limit: async () =>
    table === state.interactions
      ? state.interactionValues.filter((value) => value.submissionId === key).map((value) => ({ ...value, id: "synthetic-interaction" }))
      : [{ id: "synthetic-lead" }],
  }) }) });
  state.insert.mockImplementation((table: unknown) => ({
    values: (value: Record<string, unknown>) => ({
      onConflictDoNothing: () => {
        if (table === state.leads) {
          state.leadValues.push(value);
          return Promise.resolve(undefined);
        }
        if (table !== state.interactions) throw new Error("Unexpected write outside contact storage");
        return { returning: async () => {
          const key = String(value.submissionId);
          if (state.seen.has(key)) return [];
          state.seen.add(key);
          state.interactionValues.push(value);
          return [{ id: "synthetic-interaction" }];
        } };
      },
    }),
  }));
});

describe("persistencia del acceso asistido sin aprovisionar academias", () => {
  it("conserva datos estructurados por interacción y reusa la identidad en un replay", async () => {
    const first = await POST(request(body));
    const replay = await POST(request(body));
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    const receipt = (await first.json()).data;
    expect((await replay.json()).data).toMatchObject({
      leadId: receipt.leadId, interactionId: receipt.interactionId, idempotent: true,
    });
    expect(state.interactionValues).toHaveLength(1);
    const saved = state.interactionValues[0];
    expect(JSON.parse(String(saved.message))).toEqual({
      kind: "market_access_request", version: 1, countryName: "Argentina", role: "owner",
      disciplines: ["rhythmic"], message: body.message,
    });
    expect(saved.reason).toBe("market_access");
    expect(JSON.parse(String(state.leadValues[0].metadata)).marketAccess.countryName).toBe("Argentina");
    for (const [event] of state.event.mock.calls) {
      expect(event.idempotencyKey).toBe(`contact:${body.submissionId}`);
      expect(JSON.stringify(event)).not.toContain(body.email);
      expect(event.properties).not.toHaveProperty("countryName");
    }
    expect(state.mail.mock.calls[0][0].text).toContain("País indicado: Argentina");
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect(state.event).toHaveBeenCalledTimes(1);
    expect(state.transaction).toHaveBeenCalledTimes(2);
  });

  it("conserva el contrato de contacto normal y sus IDs al reintentar", async () => {
    const { marketAccess: _marketAccess, ...ordinary } = body;
    const first = await POST(request({ ...ordinary, reason: "support" }));
    const replay = await POST(request({ ...ordinary, reason: "support" }));
    expect(first.status).toBe(201);
    const receipt = (await first.json()).data;
    expect((await replay.json()).data).toMatchObject({
      leadId: receipt.leadId, interactionId: receipt.interactionId, idempotent: true,
    });
    expect(state.interactionValues).toHaveLength(1);
    expect(state.interactionValues[0].message).toBe(body.message);
    expect(state.interactionValues[0].reason).toBe("support");
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect(state.event).toHaveBeenCalledTimes(1);
  });

  it("rechaza otro país o contacto con la misma clave sin insertar otro lead o sustituir el historial", async () => {
    expect((await POST(request(body))).status).toBe(201);
    const countryConflict = await POST(request({ ...body, marketAccess: { ...body.marketAccess, countryName: "Chile" } }));
    const contactConflict = await POST(request({ ...body, email: "other@example.com" }));
    expect(countryConflict.status).toBe(409);
    expect(contactConflict.status).toBe(409);
    expect(state.leadValues).toHaveLength(1);
    expect(state.interactionValues).toHaveLength(1);
    expect(JSON.parse(String(state.interactionValues[0].message)).countryName).toBe("Argentina");
    expect(state.mail).toHaveBeenCalledTimes(1);
    expect(state.event).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...body, marketAccess: undefined },
    { ...body, marketAccess: { ...body.marketAccess, countryName: "" } },
    { ...body, reason: "support" },
    { ...body, message: "x".repeat(2_000) },
  ])("rechaza solicitudes inconsistentes antes de almacenar o enviar correo", async (invalid) => {
    const response = await POST(request(invalid));
    expect(response.status).toBe(400);
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.select).not.toHaveBeenCalled();
    expect(state.transaction).not.toHaveBeenCalled();
    expect(state.mail).not.toHaveBeenCalled();
    expect(state.event).not.toHaveBeenCalled();
  });
});

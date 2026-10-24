// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (payload: any) => unknown>();
  const pushToast = vi.fn();
  const client = { channel: vi.fn(), from: vi.fn() };

  return { handlers, pushToast, toast: { pushToast }, client };
});

vi.mock("@/lib/supabase/client", () => ({ createClient: () => mocks.client }));
vi.mock("@/components/ui/toast-provider", () => ({ useToast: () => mocks.toast }));
vi.mock("@/lib/plans/catalog", () => ({ getProductPlanPublicName: () => "Starter" }));

import { useRealtimeNotifications } from "@/hooks/use-realtime-notifications";

const userId = "10000000-0000-4000-8000-000000000001";
const tenantId = "10000000-0000-4000-8000-000000000002";
const academyId = "10000000-0000-4000-8000-000000000003";

type PayloadHandler = (payload: any) => unknown;

function handlerFor(table: string): PayloadHandler {
  const handler = mocks.handlers.get(table);
  if (!handler) throw new Error(`No hay handler registrado para ${table}`);
  return handler;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers.clear();

  mocks.client.channel.mockImplementation((name: string) => {
    let channel: any;
    channel = {
      on: vi.fn((_event: string, filter: { table: string }, callback: PayloadHandler) => {
        mocks.handlers.set(filter.table, callback);
        return channel;
      }),
      subscribe: vi.fn(() => channel),
      unsubscribe: vi.fn(),
    };
    return channel;
  });

  mocks.client.from.mockImplementation((table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: table === "plans"
            ? { code: "starter", nickname: "Starter" }
            : { id: academyId, name: "Academia QA", owner_id: userId, tenant_id: tenantId },
          error: null,
        })),
      })),
    })),
  }));
});

afterEach(() => cleanup());

describe("payloads de Postgres Changes", () => {
  it("usa new/old de Supabase para las notificaciones activas", async () => {
    renderHook(() => useRealtimeNotifications({ userId, tenantId, enabled: true }));

    await act(async () => {
      handlerFor("profiles")({
        eventType: "UPDATE",
        old: { is_suspended: false },
        new: { id: userId, user_id: userId, is_suspended: true },
      });

      await handlerFor("subscriptions")({
        eventType: "UPDATE",
        old: { plan_id: "old-plan", status: "active" },
        new: { user_id: userId, plan_id: "new-plan", status: "active" },
      });

      handlerFor("academies")({
        eventType: "INSERT",
        old: {},
        new: { id: academyId, name: "Academia QA", tenant_id: tenantId },
      });

      handlerFor("classes")({
        eventType: "INSERT",
        old: {},
        new: { id: "class-1", name: "Clase QA", academy_id: academyId },
      });

      handlerFor("billing_invoices")({
        eventType: "INSERT",
        old: {},
        new: { id: "invoice-1", tenant_id: tenantId, academy_id: academyId, amount_due: 5900, currency: "EUR" },
      });

      await handlerFor("contact_messages")({
        eventType: "INSERT",
        old: {},
        new: { id: "message-1", academy_id: academyId, contact_name: "Familia QA", contact_email: "qa@example.test" },
      });
    });

    expect(mocks.client.from).toHaveBeenCalledWith("plans");
    expect(mocks.client.from).toHaveBeenCalledWith("academies");
    expect(mocks.pushToast.mock.calls.map(([notification]) => notification.title)).toEqual(
      expect.arrayContaining([
        "Cuenta suspendida",
        "Plan actualizado",
        "Nueva academia creada",
        "Nueva clase creada",
        "Nuevo recibo generado",
        "Nuevo mensaje de contacto",
      ]),
    );
  });

  it("no inventa transiciones si old no contiene la columna previa", async () => {
    renderHook(() => useRealtimeNotifications({ userId, tenantId, enabled: true }));

    await act(async () => {
      handlerFor("profiles")({
        eventType: "UPDATE",
        old: { id: userId },
        new: { id: userId, user_id: userId, is_suspended: true },
      });

      handlerFor("academies")({
        eventType: "UPDATE",
        old: { id: academyId },
        new: { id: academyId, name: "Nuevo nombre", tenant_id: tenantId },
      });

      await handlerFor("subscriptions")({
        eventType: "UPDATE",
        old: { id: "subscription-1" },
        new: { user_id: userId, plan_id: "starter", status: "past_due" },
      });
    });

    expect(mocks.pushToast).not.toHaveBeenCalled();
  });
});

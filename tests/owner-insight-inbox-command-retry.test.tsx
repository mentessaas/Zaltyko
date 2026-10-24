// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { InsightInbox } from "@/components/owner-dashboard/InsightInbox";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";
import type { InsightListBundle } from "@/modules/insights/application/insight-query";

const organizationId = "40000000-0000-4000-8000-000000000001";
const insightId = "40000000-0000-4000-8000-000000000002";
const locationId = "40000000-0000-4000-8000-000000000003";
const bundle = {
  organization: {
    id: organizationId,
    name: "Academia sintética",
    defaultCurrency: "EUR",
  },
  scope: {
    locationId,
    entityId: null,
    locations: [{ id: locationId, name: "Sede sintética" }],
    canViewOrganizationAggregate: true,
  },
  items: [
    {
      id: insightId,
      organizationId,
      locationId,
      ruleKey: "attendance-follow-up",
      ruleName: "Seguimiento de asistencia",
      ruleVersion: 1,
      status: "open",
      severity: "medium",
      priorityScore: 60,
      title: "Revisar asistencia",
      detail: "Hay incidencias de asistencia que revisar.",
      evidence: { missedSessions: 2 },
      assumptions: [],
      ctaKey: "review_attendance",
      ctaPayload: {},
      estimatedValueMinMinor: null,
      estimatedValueMaxMinor: null,
      estimateCurrency: null,
      entityType: "attendance",
      entityId: null,
      detectedAt: "2026-10-23T10:00:00.000Z",
      lastSeenAt: "2026-10-23T10:00:00.000Z",
      snoozedUntil: null,
      version: 1,
    },
  ],
  nextCursor: null,
} as unknown as InsightListBundle;

function response(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "free" });
  vi.stubGlobal("fetch", mocks.fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("reintento de comandos de insights", () => {
  it("evita el doble envío y conserva la misma clave tras una respuesta ambigua", async () => {
    let resolveFirst!: (value: ReturnType<typeof response>) => void;
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise<ReturnType<typeof response>>((resolve) => {
          resolveFirst = resolve;
        })
    );
    const user = userEvent.setup();
    render(<InsightInbox bundle={bundle} />);
    const action = screen.getByRole("button", { name: "Revisar asistencia" });

    act(() => {
      fireEvent.click(action);
      fireEvent.click(action);
    });
    expect(mocks.fetch).toHaveBeenCalledOnce();

    await act(async () => {
      resolveFirst(
        response(503, { detail: "Respuesta temporalmente no disponible." })
      );
      await Promise.resolve();
    });
    const retry = await screen.findByRole("button", {
      name: "Reintentar el mismo envío",
    });
    mocks.fetch.mockResolvedValueOnce(
      response(200, { ok: true, data: { id: "receipt" } })
    );
    await user.click(retry);

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    const firstRequest = mocks.fetch.mock.calls[0][1];
    const retryRequest = mocks.fetch.mock.calls[1][1];
    expect(retryRequest.body).toBe(firstRequest.body);
    expect(retryRequest.headers["idempotency-key"]).toBe(
      firstRequest.headers["idempotency-key"]
    );
  });
});

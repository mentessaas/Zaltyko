// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/components/owner-dashboard/use-pending-command-exit-warning", () => ({
  usePendingCommandExitWarning: () => undefined,
}));

import {
  OWNER_ATHLETE_INTAKE_PENDING_STORAGE_PREFIX,
  OwnerAthleteIntakeWorkspace,
} from "@/components/owner-dashboard/OwnerAthleteIntakeWorkspace";

const ORGANIZATION_ID = "80000000-0000-4000-8000-000000000001";
const ATHLETE_ID = "80000000-0000-4000-8000-000000000002";
const FAMILY_ID = "80000000-0000-4000-8000-000000000003";
const GROUP_ID = "80000000-0000-4000-8000-000000000004";
const MEMBERSHIP_ID = "80000000-0000-4000-8000-000000000005";
const KEY = "80000000-0000-4000-8000-000000000006";

const item = {
  athleteId: ATHLETE_ID,
  givenName: "Luna",
  familyName: "Ríos",
  familySummaries: [{ familyId: FAMILY_ID, relationship: "parent", startsOn: "2026-10-24", incompleteFamily: true }],
  incompleteFamily: true,
};
const group = {
  groupId: GROUP_ID,
  groupName: "Iniciación",
  locationId: "80000000-0000-4000-8000-000000000007",
  locationName: "Sede Norte",
  capacity: 12,
  occupancy: 5,
  availablePlaces: 7,
};

function listResponse(items = [item], eligibleGroups = [group]) {
  return { ok: true, data: { items, eligibleGroups, total: items.length, page: 1, pageSize: 50, hasMore: false } };
}

function usageResponse(readOnly = false) {
  const resources = [
    { resource: "athletes", current: readOnly ? 31 : 8, limit: 30, excess: readOnly ? 1 : 0 },
    { resource: "groups", current: 2, limit: 3, excess: 0 },
    { resource: "classes", current: 4, limit: 10, excess: 0 },
  ];
  return { ok: true, data: { readOnly, planCode: readOnly ? "free" : "starter", resources, items: [], next: null } };
}

function httpResponse(status: number, payload: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => payload } as Response;
}

function storageKey() {
  return `${OWNER_ATHLETE_INTAKE_PENDING_STORAGE_PREFIX}${ORGANIZATION_ID}`;
}

function createPendingIntent() {
  const body = JSON.stringify({
    organizationId: ORGANIZATION_ID,
    givenName: "Luna",
    familyName: "Ríos",
    family: { kind: "new", relationship: "parent", startsOn: "2026-10-24" },
  });
  return {
    version: 1,
    organizationId: ORGANIZATION_ID,
    kind: "create",
    endpoint: "/api/v1/owner/athlete-intake",
    idempotencyKey: KEY,
    body,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let uuidMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.sessionStorage.clear();
  uuidMock = vi.fn(() => KEY);
  vi.stubGlobal("crypto", { randomUUID: uuidMock });
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/v1/owner/saas/usage")) return httpResponse(200, usageResponse()) as Response;
    if (url.startsWith("/api/v1/owner/athlete-intake?")) return httpResponse(200, listResponse()) as Response;
    return httpResponse(500, { ok: false }) as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("bandeja Owner de gimnastas sin asignación", () => {
  it("muestra vínculos familiares con su fecha efectiva y no infiere una fecha distinta", async () => {
    render(<OwnerAthleteIntakeWorkspace organizationId={ORGANIZATION_ID} organizationName="Club Norte" />);

    expect(await screen.findByRole("heading", { name: "Luna Ríos" })).toBeInTheDocument();
    expect(screen.getByText("Madre, padre o progenitor · fecha efectiva 2026-10-24 · faltan datos de tutor/pagador")).toBeInTheDocument();
    expect(screen.getByText(/No crea tutor, pagador, cuenta ni envía mensajes/u)).toBeInTheDocument();
  });

  it("guarda y relee el comando exacto antes del POST y limpia solo tras un recibo estricto", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/owner/saas/usage")) return httpResponse(200, usageResponse()) as Response;
      if (url.startsWith("/api/v1/owner/athlete-intake?")) return httpResponse(200, listResponse()) as Response;
      if (init?.method === "POST") {
        const stored = window.sessionStorage.getItem(storageKey());
        expect(stored).not.toBeNull();
        const intent = JSON.parse(stored ?? "null") as { idempotencyKey: string; body: string };
        expect(intent.idempotencyKey).toBe(KEY);
        expect(JSON.parse(intent.body)).toMatchObject({ givenName: "Ana María", familyName: "Pérez López" });
        expect(init.headers).toMatchObject({ "Idempotency-Key": KEY });
        return httpResponse(201, { ok: true, data: { athleteId: ATHLETE_ID, familyId: FAMILY_ID, incompleteFamily: true, replayed: false } }) as Response;
      }
      return httpResponse(500, { ok: false }) as Response;
    });

    render(<OwnerAthleteIntakeWorkspace organizationId={ORGANIZATION_ID} organizationName="Club Norte" />);
    await screen.findByRole("heading", { name: "Luna Ríos" });
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: " Ana   María " } });
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "Pérez   López" } });
    fireEvent.change(screen.getByLabelText("Fecha efectiva del vínculo familiar"), { target: { value: "2026-10-25" } });
    fireEvent.submit(screen.getByRole("button", { name: "Crear ficha y familia" }).closest("form")!);

    expect(await screen.findByText(/Ficha creada/u)).toBeInTheDocument();
    expect(screen.getByText(/La familia queda incompleta/)).toBeInTheDocument();
    expect(window.sessionStorage.getItem(storageKey())).toBeNull();
  });

  it("deduplica dos submits síncronos durante el preflight y ejecuta un solo comando", async () => {
    let resolvePreflight: ((response: Response) => void) | null = null;
    const preflight = new Promise<Response>((resolve) => { resolvePreflight = resolve; });
    let usageRequests = 0;
    let postRequests = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/owner/saas/usage")) {
        usageRequests += 1;
        if (usageRequests === 1) return httpResponse(200, usageResponse()) as Response;
        if (usageRequests === 2) return preflight;
        return httpResponse(200, usageResponse()) as Response;
      }
      if (url.startsWith("/api/v1/owner/athlete-intake?")) return httpResponse(200, listResponse()) as Response;
      if (init?.method === "POST") {
        postRequests += 1;
        const stored = window.sessionStorage.getItem(storageKey());
        expect(stored).not.toBeNull();
        const pending = JSON.parse(stored ?? "null") as { idempotencyKey: string };
        expect(pending.idempotencyKey).toBe(KEY);
        return httpResponse(201, { ok: true, data: { athleteId: ATHLETE_ID, familyId: FAMILY_ID, incompleteFamily: true, replayed: false } }) as Response;
      }
      return httpResponse(500, { ok: false }) as Response;
    });

    render(<OwnerAthleteIntakeWorkspace organizationId={ORGANIZATION_ID} organizationName="Club Norte" />);
    await screen.findByRole("heading", { name: "Luna Ríos" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear ficha y familia" })).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "Pérez" } });
    fireEvent.change(screen.getByLabelText("Fecha efectiva del vínculo familiar"), { target: { value: "2026-10-25" } });
    const form = screen.getByRole("button", { name: "Crear ficha y familia" }).closest("form")!;

    // Keep both events in the same React batch: the synchronous ref, rather
    // than a committed busy state, must reject the second preparation.
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    await waitFor(() => expect(usageRequests).toBe(2));
    expect(postRequests).toBe(0);
    expect(uuidMock).toHaveBeenCalledTimes(1);

    await act(async () => { resolvePreflight?.(httpResponse(200, usageResponse()) as Response); });
    expect(await screen.findByText(/Ficha creada/u)).toBeInTheDocument();
    expect(postRequests).toBe(1);
    expect(uuidMock).toHaveBeenCalledTimes(1);
  });

  it("no reenvía al restaurar una operación y permite su replay exacto aunque la academia esté en solo lectura", async () => {
    const intent = createPendingIntent();
    window.sessionStorage.setItem(storageKey(), JSON.stringify(intent));
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/owner/saas/usage")) return httpResponse(200, usageResponse(true)) as Response;
      if (url.startsWith("/api/v1/owner/athlete-intake?")) return httpResponse(200, listResponse()) as Response;
      if (init?.method === "POST") {
        expect(window.sessionStorage.getItem(storageKey())).toBe(JSON.stringify(intent));
        expect(String(init.body)).toBe(intent.body);
        expect(init.headers).toMatchObject({ "Idempotency-Key": KEY });
        return httpResponse(200, { ok: true, data: { athleteId: ATHLETE_ID, familyId: FAMILY_ID, incompleteFamily: true, replayed: true } }) as Response;
      }
      return httpResponse(500, { ok: false }) as Response;
    });

    render(<OwnerAthleteIntakeWorkspace organizationId={ORGANIZATION_ID} organizationName="Club Norte" />);
    const retry = await screen.findByRole("button", { name: "Reintentar exactamente la misma operación" });
    expect(fetchMock.mock.calls.some(([input, init]) => String(input).startsWith("/api/v1/owner/athlete-intake") && (init as RequestInit | undefined)?.method === "POST")).toBe(false);
    expect(screen.getByRole("button", { name: "Crear ficha y familia" })).toBeDisabled();

    fireEvent.click(retry);
    expect(await screen.findByText(/el servidor confirmó el alta anterior/u)).toBeInTheDocument();
    expect(window.sessionStorage.getItem(storageKey())).toBeNull();
  });

  it("fail-closes ante un marcador local que no puede validar y no inicia escrituras", async () => {
    window.sessionStorage.setItem(storageKey(), "{broken");
    render(<OwnerAthleteIntakeWorkspace organizationId={ORGANIZATION_ID} organizationName="Club Norte" />);

    expect(await screen.findByText(/operación guardada que no se puede validar/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear ficha y familia" })).toBeDisabled();
    expect(fetchMock.mock.calls.some(([input, init]) => String(input).startsWith("/api/v1/owner/athlete-intake") && (init as RequestInit | undefined)?.method === "POST")).toBe(false);
    expect(window.sessionStorage.getItem(storageKey())).toBe("{broken");
  });

  it("asigna solo a un grupo devuelto por el servidor y exige fecha civil explícita", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/owner/saas/usage")) return httpResponse(200, usageResponse()) as Response;
      if (url.startsWith("/api/v1/owner/athlete-intake?")) return httpResponse(200, listResponse()) as Response;
      if (init?.method === "POST" && url.endsWith(`/api/v1/owner/athlete-intake/${ATHLETE_ID}/assign`)) {
        const stored = JSON.parse(window.sessionStorage.getItem(storageKey()) ?? "null") as { body: string; idempotencyKey: string };
        const body = JSON.parse(stored.body) as Record<string, unknown>;
        expect(body).toEqual({ organizationId: ORGANIZATION_ID, groupId: GROUP_ID, startsOn: "2026-10-25" });
        expect(init.headers).toMatchObject({ "Idempotency-Key": KEY });
        return httpResponse(201, { ok: true, data: { athleteId: ATHLETE_ID, groupId: GROUP_ID, membershipId: MEMBERSHIP_ID, startsOn: "2026-10-25", replayed: false } }) as Response;
      }
      return httpResponse(500, { ok: false }) as Response;
    });

    render(<OwnerAthleteIntakeWorkspace organizationId={ORGANIZATION_ID} organizationName="Club Norte" />);
    await screen.findByRole("heading", { name: "Luna Ríos" });
    fireEvent.click(screen.getByRole("button", { name: "Asignar a un grupo" }));
    fireEvent.change(screen.getByLabelText("Grupo y sede"), { target: { value: GROUP_ID } });
    fireEvent.change(screen.getByLabelText("Fecha civil de inicio en la sede"), { target: { value: "2026-10-25" } });
    fireEvent.submit(screen.getByRole("button", { name: "Asignar gimnasta" }).closest("form")!);

    expect(await screen.findByText(/Gimnasta asignada al grupo/u)).toBeInTheDocument();
    expect(window.sessionStorage.getItem(storageKey())).toBeNull();
  });
});

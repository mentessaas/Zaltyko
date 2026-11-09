import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createClient: vi.fn(),
  getUser: vi.fn(),
  resolveOwnerScope: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: mocks.resolveOwnerScope,
}));

import OwnerMonthlyInvoicesPage from "@/app/owner/monthly-invoices/page";

const userId = "10000000-0000-4000-8000-000000000001";
const organizationId = "20000000-0000-4000-8000-000000000001";
const memberId = "30000000-0000-4000-8000-000000000001";
const locationId = "40000000-0000-4000-8000-000000000001";

type Location = { id: string; name: string; timezone?: string | null };

function ownerScope(location: Location) {
  return {
    organization: {
      id: organizationId,
      name: "Academia de prueba",
      defaultCurrency: "MXN",
    },
    member: { id: memberId, role: "owner" as const, locationScopeMode: "all" as const },
    locations: [location],
    selectedLocationId: location.id,
    canViewOrganizationAggregate: true,
  };
}

async function loadPage(options: {
  timezone?: string | null;
  servicePeriod?: string;
}) {
  const location: Location = {
    id: locationId,
    name: "Sede seleccionada",
    ...(options.timezone === undefined ? {} : { timezone: options.timezone }),
  };
  mocks.resolveOwnerScope.mockResolvedValue(ownerScope(location));
  return OwnerMonthlyInvoicesPage({
    searchParams: Promise.resolve({
      organizationId,
      locationId,
      servicePeriod: options.servicePeriod,
    }),
  });
}

function initialServicePeriod(element: unknown): string {
  const shell = element as ReactElement<{ children: ReactNode }>;
  const manager = shell.props.children as ReactElement<{
    initialServicePeriod: string;
  }>;
  return manager.props.initialServicePeriod;
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.cookies.mockReset().mockResolvedValue({});
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: userId } } });
  mocks.createClient
    .mockReset()
    .mockResolvedValue({ auth: { getUser: mocks.getUser } });
  mocks.resolveOwnerScope.mockReset();
  mocks.redirect.mockClear();
  mocks.notFound.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("periodo inicial de cuotas mensuales por sede", () => {
  it("usa el mes civil de Ciudad de México cerca del cambio de mes UTC", async () => {
    vi.setSystemTime(new Date("2026-11-01T05:30:00.000Z"));

    const page = await loadPage({ timezone: "America/Mexico_City" });

    expect(initialServicePeriod(page)).toBe("2026-10");
  });

  it("respeta Canarias al final del mes en vez de aplicar Madrid", async () => {
    vi.setSystemTime(new Date("2026-10-31T23:30:00.000Z"));

    const page = await loadPage({ timezone: "Atlantic/Canary" });

    expect(initialServicePeriod(page)).toBe("2026-10");
  });

  it("prioriza el periodo explícito aunque la zona no sirva para derivar el actual", async () => {
    vi.setSystemTime(new Date("2026-11-01T05:30:00.000Z"));

    const page = await loadPage({
      timezone: "Invalid/Timezone",
      servicePeriod: "2026-08",
    });

    expect(initialServicePeriod(page)).toBe("2026-08");
  });

  it.each([
    ["ausente", undefined],
    ["inválida", "Invalid/Timezone"],
  ])("falla cerrado con una zona horaria %s", async (_state, timezone) => {
    vi.setSystemTime(new Date("2026-11-01T05:30:00.000Z"));

    const page = (await loadPage({ timezone })) as ReactElement<{
      children: ReactElement<{ role?: string; children?: ReactNode }>;
    }>;
    const alert = page.props.children;

    expect(alert.props.role).toBe("alert");
    expect(String(alert.props.children)).toContain(
      "La sede no tiene una zona horaria válida"
    );
  });
});

/**
 * Pago automático de cuotas (Fase 2): cargadores de las dos páginas que
 * enseñan el pago automático. Las páginas ya no salen por la bandera: decide
 * el servicio (simulado aquí). Lo no disponible no se pinta, una lectura que
 * falla no rompe la página y en el registro solo van ids y el tipo de error.
 * Solo datos sintéticos.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({})) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
  usePathname: () => "/",
  useRouter: () => ({ replace: () => undefined, refresh: () => undefined, push: () => undefined }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "90000000-0000-4000-8000-000000000101" } } }) },
  })),
}));
vi.mock("@/app/familia/_lib/family-user", () => ({
  requireFamilyUser: vi.fn(async () => ({ id: "90000000-0000-4000-8000-000000000101" })),
}));
vi.mock("@/modules/family-portal/application/family-portal-reads", () => ({
  getFamilyFees: vi.fn(),
}));
vi.mock("@/modules/family-portal/application/family-portal-access", () => ({
  resolveFamilyPortalAccess: vi.fn(),
}));
vi.mock("@/modules/family-payment-methods/application/family-payment-methods-service", () => ({
  getFamilyPaymentMethodState: vi.fn(),
  getOwnerFamilyPaymentMethodsView: vi.fn(),
}));
vi.mock("@/components/family-portal/FamilyFeesView", () => ({
  FamilyFeesView: vi.fn(() => null),
}));
vi.mock("@/components/family-portal/FamilyPortalShell", () => ({
  FamilyPortalShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: vi.fn(),
}));
vi.mock("@/modules/family-access/application/family-access-storage", () => ({
  isFamilyAccessAvailableForPage: vi.fn(async () => true),
  isFamilyAccessStorageInstalledForPage: vi.fn(async () => true),
}));
vi.mock("@/modules/family-access/application/family-notices", () => ({
  getOwnerNoticesBundle: vi.fn(async () => null),
}));
vi.mock("@/modules/family-access/application/guardian-invitations", () => ({
  listOwnerFamilyAccess: vi.fn(async () => null),
}));
vi.mock("@/components/owner-dashboard/OwnerWorkspacePageShell", () => ({
  OwnerWorkspacePageShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/owner-dashboard/OwnerFamilyAccessManager", () => ({
  OwnerFamilyAccessManager: () => null,
}));
vi.mock("@/components/owner-dashboard/OwnerFamilyNoticesPanel", () => ({
  OwnerFamilyNoticesPanel: () => null,
}));
vi.mock("@/components/owner-dashboard/OwnerFamilyPaymentMethodsPanel", () => ({
  OwnerFamilyPaymentMethodsPanel: vi.fn(() => <p>panel-pago-automatico</p>),
}));

import { FamilyFeesView } from "@/components/family-portal/FamilyFeesView";
import { OwnerFamilyPaymentMethodsPanel } from "@/components/owner-dashboard/OwnerFamilyPaymentMethodsPanel";
import { PRODUCTION_SUPABASE_PROJECT_REF } from "@/lib/launch/production-supabase";
import { logger } from "@/lib/logger";
import {
  getFamilyPaymentMethodState,
  getOwnerFamilyPaymentMethodsView,
} from "@/modules/family-payment-methods/application/family-payment-methods-service";
import { resolveFamilyPortalAccess } from "@/modules/family-portal/application/family-portal-access";
import { getFamilyFees, type FamilyAcademyFees } from "@/modules/family-portal/application/family-portal-reads";
import { resolveOwnerScope, type OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import FamilyFeesPage from "@/app/familia/cuotas/page";
import OwnerFamiliesPage from "@/app/owner/familias/page";

const USER_ID = "90000000-0000-4000-8000-000000000101";
const ORGANIZATION_ID = "90000000-0000-4000-8000-000000000001";
const FAMILY_ACTIVE = "90000000-0000-4000-8000-000000000301";
const FAMILY_OFF = "90000000-0000-4000-8000-000000000302";
const AUTHORIZATION_ID = "90000000-0000-4000-8000-000000000401";
const PHASE_FLAG = "ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED";

const academy: FamilyAcademyFees = {
  organizationId: ORGANIZATION_ID,
  organizationName: "Club Sintético",
  timezone: "Europe/Madrid",
  fees: [],
};

const activeState = {
  kind: "active" as const,
  method: "card" as const,
  since: "2026-11-10T09:00:00.000Z",
  kinds: [],
  academyName: "Club Sintético",
  consentVersion: "borrador-2026-11-16",
  consentTexts: {},
};

const listedMethod = {
  authorizationId: AUTHORIZATION_ID,
  familyId: FAMILY_ACTIVE,
  payerName: "Lucía García",
  method: "card" as const,
  since: "2026-11-10T09:00:00.000Z",
};

function access() {
  return {
    academies: [{ organizationId: ORGANIZATION_ID, feeFamilyIds: [FAMILY_ACTIVE, FAMILY_OFF] }],
  } as unknown as Awaited<ReturnType<typeof resolveFamilyPortalAccess>>;
}

function ownerScope(locationScopeMode: "all" | "selected" = "all"): OwnerScope {
  return {
    organization: { id: ORGANIZATION_ID, name: "Club Sintético", defaultCurrency: "EUR" },
    member: { id: "90000000-0000-4000-8000-000000000201", role: "owner", locationScopeMode },
    locations: [{ id: "90000000-0000-4000-8000-000000000501" }],
    selectedLocationId: "90000000-0000-4000-8000-000000000501",
    canViewOrganizationAggregate: true,
  } as unknown as OwnerScope;
}

/** Lo que la página de cuotas pasa a la vista. */
function automaticPaymentsPassed() {
  const calls = vi.mocked(FamilyFeesView).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0].automaticPayments;
}

async function renderFeesPage() {
  return renderToStaticMarkup(await FamilyFeesPage());
}

async function renderOwnerPage() {
  return renderToStaticMarkup(
    await OwnerFamiliesPage({ searchParams: Promise.resolve({ organizationId: ORGANIZATION_ID }) })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Clave de test y base que no es la de producción.
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://synthetic.supabase.co");
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
  vi.stubEnv("DATABASE_URL_POOL", "");
  vi.stubEnv("DATABASE_URL_DIRECT", "");
  // Cobro automático (Fase 3) y domiciliación apagados, sin depender del .env local.
  vi.stubEnv("ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED", "");
  vi.stubEnv("ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED", "");
  vi.mocked(getFamilyFees).mockResolvedValue([academy]);
  vi.mocked(resolveFamilyPortalAccess).mockResolvedValue(access());
  vi.mocked(getFamilyPaymentMethodState).mockImplementation(async ({ familyId }) =>
    familyId === FAMILY_ACTIVE ? activeState : { kind: "unavailable", reason: "flag_off" }
  );
  vi.mocked(resolveOwnerScope).mockResolvedValue(ownerScope());
  vi.mocked(getOwnerFamilyPaymentMethodsView).mockResolvedValue({ visible: true, methods: [listedMethod] });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/familia/cuotas: pago automático", () => {
  it.each([
    ["apagada", undefined],
    ["encendida", "true"],
  ])("con la bandera %s pregunta al servicio y filtra lo no disponible", async (_label, flag) => {
    if (flag === undefined) delete process.env[PHASE_FLAG];
    else vi.stubEnv(PHASE_FLAG, flag);

    await renderFeesPage();

    expect(getFamilyPaymentMethodState).toHaveBeenCalledTimes(2);
    expect(getFamilyPaymentMethodState).toHaveBeenCalledWith({
      userId: USER_ID,
      organizationId: ORGANIZATION_ID,
      familyId: FAMILY_ACTIVE,
    });
    expect(automaticPaymentsPassed()).toEqual({
      [ORGANIZATION_ID]: [{ familyId: FAMILY_ACTIVE, state: activeState }],
    });
  });

  it("si todas son no disponibles no hay ninguna tarjeta", async () => {
    vi.mocked(getFamilyPaymentMethodState).mockResolvedValue({ kind: "unavailable", reason: "flag_off" });

    await renderFeesPage();

    expect(automaticPaymentsPassed()).toEqual({});
  });

  it.each([
    ["clave Live", () => vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_synthetic")],
    ["base de producción", () => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`)],
  ])("con %s no resuelve el acceso ni pregunta al servicio", async (_label, arrange) => {
    arrange();

    await renderFeesPage();

    expect(resolveFamilyPortalAccess).not.toHaveBeenCalled();
    expect(getFamilyPaymentMethodState).not.toHaveBeenCalled();
    expect(automaticPaymentsPassed()).toEqual({});
  });

  it("sin academias con cuotas no consulta nada", async () => {
    vi.mocked(getFamilyFees).mockResolvedValue([]);

    await renderFeesPage();

    expect(resolveFamilyPortalAccess).not.toHaveBeenCalled();
    expect(getFamilyPaymentMethodState).not.toHaveBeenCalled();
  });

  it("si una lectura del servicio lanza, esa tarjeta no sale, las demás sí y la página no falla", async () => {
    vi.mocked(getFamilyPaymentMethodState).mockImplementation(async ({ familyId }) => {
      if (familyId === FAMILY_OFF) throw new Error("detalle interno de la base");
      return activeState;
    });

    await expect(renderFeesPage()).resolves.toEqual(expect.any(String));

    expect(automaticPaymentsPassed()).toEqual({
      [ORGANIZATION_ID]: [{ familyId: FAMILY_ACTIVE, state: activeState }],
    });
    expect(logger.warn).toHaveBeenCalledWith("family_portal.automatic_payment_state_failed", { errorName: "Error" });
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain("detalle interno");
  });

  it("si resolver el acceso lanza, no hay tarjetas y la página no falla", async () => {
    vi.mocked(resolveFamilyPortalAccess).mockRejectedValue(new TypeError("caída"));

    await expect(renderFeesPage()).resolves.toEqual(expect.any(String));

    expect(automaticPaymentsPassed()).toEqual({});
    expect(logger.warn).toHaveBeenCalledWith("family_portal.automatic_payment_state_failed", { errorName: "TypeError" });
  });
});

describe("/owner/familias: panel de pago automático", () => {
  it.each([
    ["apagada", undefined],
    ["encendida", "true"],
  ])("con la bandera %s pregunta al servicio y pinta el panel con las activas", async (_label, flag) => {
    if (flag === undefined) delete process.env[PHASE_FLAG];
    else vi.stubEnv(PHASE_FLAG, flag);

    const html = await renderOwnerPage();

    expect(getOwnerFamilyPaymentMethodsView).toHaveBeenCalledWith({ userId: USER_ID, organizationId: ORGANIZATION_ID });
    expect(html).toContain("panel-pago-automatico");
    expect(vi.mocked(OwnerFamilyPaymentMethodsPanel).mock.calls[0][0]).toEqual({
      organizationId: ORGANIZATION_ID,
      methods: [listedMethod],
      // D2: la domiciliación no se cobra sola mientras su bandera esté apagada.
      sepaCollectsAutomatically: false,
    });
  });

  it("vacío pero disponible: pinta el panel vacío", async () => {
    vi.mocked(getOwnerFamilyPaymentMethodsView).mockResolvedValue({ visible: true, methods: [] });

    const html = await renderOwnerPage();

    expect(html).toContain("panel-pago-automatico");
    expect(vi.mocked(OwnerFamilyPaymentMethodsPanel).mock.calls[0][0].methods).toEqual([]);
  });

  it("no disponible: no pinta el panel", async () => {
    vi.mocked(getOwnerFamilyPaymentMethodsView).mockResolvedValue({ visible: false });

    const html = await renderOwnerPage();

    expect(html).not.toContain("panel-pago-automatico");
    expect(OwnerFamilyPaymentMethodsPanel).not.toHaveBeenCalled();
  });

  it("si la lectura lanza un error inesperado: sin panel, sin 500 y solo ids y el tipo en el registro", async () => {
    vi.mocked(getOwnerFamilyPaymentMethodsView).mockRejectedValue(new TypeError("detalle interno de la base"));

    const html = await renderOwnerPage();

    expect(html).toContain("Familias y avisos");
    expect(html).not.toContain("panel-pago-automatico");
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), {
      organizationId: ORGANIZATION_ID,
      errorName: "TypeError",
    });
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain("detalle interno");
  });

  it("sin permiso (error operativo): sin panel y sin registro", async () => {
    vi.mocked(getOwnerFamilyPaymentMethodsView).mockRejectedValue(
      new OperationalError("FORBIDDEN", "Sin permiso.", 403)
    );

    const html = await renderOwnerPage();

    expect(html).not.toContain("panel-pago-automatico");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each([
    ["clave Live", () => vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_synthetic")],
    ["base de producción", () => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`)],
  ])("con %s no pregunta al servicio ni pinta el panel", async (_label, arrange) => {
    arrange();

    const html = await renderOwnerPage();

    expect(getOwnerFamilyPaymentMethodsView).not.toHaveBeenCalled();
    expect(html).not.toContain("panel-pago-automatico");
  });

  it("quien no tiene todas las sedes no ve el panel", async () => {
    vi.mocked(resolveOwnerScope).mockResolvedValue(ownerScope("selected"));

    const html = await renderOwnerPage();

    expect(getOwnerFamilyPaymentMethodsView).not.toHaveBeenCalled();
    expect(html).not.toContain("panel-pago-automatico");
  });
});

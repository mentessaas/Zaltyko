/**
 * Cobro automático de cuotas (Fase 3): cargadores de las cuatro páginas que
 * enseñan el cobro automático (/familia/cuotas, /owner/settings,
 * /owner/familias y /owner/payments). En Live o contra producción no se carga
 * ni la lectura; con la bandera apagada tampoco, salvo en /familia/cuotas y
 * /owner/payments, que siguen enseñando los cobros en marcha; sin tablas (la lectura no devuelve
 * nada) no se pinta nada nuevo; si la lectura lanza, la página no falla y en
 * el registro solo van ids y el tipo de error. Solo datos sintéticos.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "93000000-0000-4000-8000-000000000101";
const ORGANIZATION_ID = "93000000-0000-4000-8000-000000000001";
const FAMILY_ID = "93000000-0000-4000-8000-000000000301";
const INVOICE_ID = "93000000-0000-4000-8000-000000000401";

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
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "93000000-0000-4000-8000-000000000101" } } }) },
  })),
}));
// Lecturas de la Fase 3 (solo se cargan con el cobro automático abierto).
vi.mock("@/modules/family-collection/application/family-collection-reads", () => ({
  getFamilyAutomaticCollectionModes: vi.fn(),
  getFamilyAutomaticFeeStatuses: vi.fn(),
  getOwnerAutomaticCollections: vi.fn(),
  getOwnerFamilyCollectionSwitches: vi.fn(),
}));
vi.mock("@/modules/family-collection/application/collection-settings-service", () => ({
  getCollectionSettings: vi.fn(),
}));
// /familia/cuotas
vi.mock("@/app/familia/_lib/family-user", () => ({
  requireFamilyUser: vi.fn(async () => ({ id: "93000000-0000-4000-8000-000000000101" })),
}));
vi.mock("@/modules/family-portal/application/family-portal-reads", () => ({
  getFamilyFees: vi.fn(),
}));
vi.mock("@/modules/family-portal/application/family-portal-access", () => ({
  resolveFamilyPortalAccess: vi.fn(async () => ({ academies: [] })),
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
// Páginas de /owner
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: vi.fn(),
}));
vi.mock("@/components/owner-dashboard/OwnerWorkspacePageShell", () => ({
  OwnerWorkspacePageShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
// /owner/settings
vi.mock("@/components/owner-dashboard/OwnerAcademySettingsManager", () => ({
  OwnerAcademySettingsManager: () => null,
}));
vi.mock("@/components/owner-dashboard/OwnerStripeConnectCard", () => ({
  OwnerStripeConnectCard: ({ children }: { children?: ReactNode }) => <div>tarjeta-cobro-automatico{children}</div>,
}));
vi.mock("@/components/owner-dashboard/OwnerCollectionDaySettings", () => ({
  OwnerCollectionDaySettings: vi.fn(() => <p>ajuste-dia-de-cobro</p>),
}));
// /owner/familias
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
vi.mock("@/components/owner-dashboard/OwnerFamilyAccessManager", () => ({
  OwnerFamilyAccessManager: () => null,
}));
vi.mock("@/components/owner-dashboard/OwnerFamilyNoticesPanel", () => ({
  OwnerFamilyNoticesPanel: () => null,
}));
vi.mock("@/components/owner-dashboard/OwnerFamilyPaymentMethodsPanel", () => ({
  OwnerFamilyPaymentMethodsPanel: vi.fn(() => <p>panel-pago-automatico</p>),
}));
// /owner/payments
vi.mock("@/modules/billing/application/manual-payments", () => ({
  getManualPaymentOptions: vi.fn(),
}));
vi.mock("@/modules/payment-reminders/application/service", () => ({
  getPaymentReminderOverview: vi.fn(),
}));
vi.mock("@/modules/payment-reminders/application/storage", () => ({
  arePaymentRemindersAvailable: vi.fn(async () => false),
  isAutomaticPaymentRemindersFlagEnabled: vi.fn(() => false),
}));
vi.mock("@/modules/payments-connect/application/connect-onboarding-service", () => ({
  getConnectStatus: vi.fn(),
}));
vi.mock("@/modules/owner-dashboard/application/summary-charts", () => ({
  resolveOwnerChartScope: vi.fn(async () => ({})),
  getOwnerMonthlyFeesChart: vi.fn(async () => null),
}));
vi.mock("@/components/owner-dashboard/charts/OwnerChartPanels", () => ({
  OwnerMonthlyFeesPanel: () => null,
}));
vi.mock("@/components/owner-dashboard/PaymentRemindersPanel", () => ({
  PaymentRemindersPanel: () => null,
}));
vi.mock("@/components/owner-dashboard/ManualPaymentForm", () => ({
  ManualPaymentForm: vi.fn(() => <p>formulario-pago-manual</p>),
}));
vi.mock("@/components/owner-dashboard/OwnerAutomaticCollectionsPanel", () => ({
  OwnerAutomaticCollectionsPanel: vi.fn(() => <p>cobros-automaticos-del-mes</p>),
}));

import { FamilyFeesView } from "@/components/family-portal/FamilyFeesView";
import { ManualPaymentForm } from "@/components/owner-dashboard/ManualPaymentForm";
import { OwnerAutomaticCollectionsPanel } from "@/components/owner-dashboard/OwnerAutomaticCollectionsPanel";
import { OwnerCollectionDaySettings } from "@/components/owner-dashboard/OwnerCollectionDaySettings";
import { OwnerFamilyPaymentMethodsPanel } from "@/components/owner-dashboard/OwnerFamilyPaymentMethodsPanel";
import { PRODUCTION_SUPABASE_PROJECT_REF } from "@/lib/launch/production-supabase";
import { logger } from "@/lib/logger";
import { getManualPaymentOptions } from "@/modules/billing/application/manual-payments";
import { getConnectStatus } from "@/modules/payments-connect/application/connect-onboarding-service";
import { getCollectionSettings } from "@/modules/family-collection/application/collection-settings-service";
import {
  getFamilyAutomaticCollectionModes,
  getFamilyAutomaticFeeStatuses,
  getOwnerAutomaticCollections,
  getOwnerFamilyCollectionSwitches,
  type OwnerAutomaticCollectionsView,
} from "@/modules/family-collection/application/family-collection-reads";
import {
  getFamilyPaymentMethodState,
  getOwnerFamilyPaymentMethodsView,
} from "@/modules/family-payment-methods/application/family-payment-methods-service";
import { getFamilyFees, type FamilyAcademyFees } from "@/modules/family-portal/application/family-portal-reads";
import { resolveOwnerScope, type OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import FamilyFeesPage from "@/app/familia/cuotas/page";
import OwnerFamiliesPage from "@/app/owner/familias/page";
import OwnerPaymentsPage from "@/app/owner/payments/page";
import OwnerSettingsPage from "@/app/owner/settings/page";

const PHASE_FLAG = "ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED";
const SEPA_FLAG = "ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_SEPA_ENABLED";

const academy: FamilyAcademyFees = {
  organizationId: ORGANIZATION_ID,
  organizationName: "Club Sintético",
  timezone: "Europe/Madrid",
  fees: [
    {
      invoiceId: INVOICE_ID,
      reference: "CUO-2026-11-001",
      status: "issued",
      currency: "EUR",
      totalCents: 4500,
      paidCents: 0,
      refundedCents: 0,
      pendingCents: 4500,
      dueAt: "2026-11-20T22:59:59.999Z",
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
    },
  ],
};

const listedMethod = {
  authorizationId: "93000000-0000-4000-8000-000000000501",
  familyId: FAMILY_ID,
  payerName: "Lucía García",
  method: "card" as const,
  since: "2026-11-10T09:00:00.000Z",
};

const switches = {
  available: true,
  families: { [FAMILY_ID]: { automatic: true, version: 2, requiresConfirmation: false } },
};

const automaticView: OwnerAutomaticCollectionsView = {
  month: "2026-11",
  truncated: false,
  items: [
    {
      invoiceId: INVOICE_ID,
      invoiceReference: "CUO-2026-11-001",
      servicePeriodStart: null,
      payerName: "Lucía García",
      amountCents: 4500,
      currency: "EUR",
      state: "in_progress",
      date: null,
      reason: null,
      needsReview: false,
      canCancel: false,
      canMarkReviewed: false,
      manualPaymentBlocked: true,
    },
    {
      invoiceId: "93000000-0000-4000-8000-000000000402",
      invoiceReference: "CUO-2026-11-002",
      servicePeriodStart: null,
      payerName: null,
      amountCents: 3000,
      currency: "EUR",
      state: "scheduled",
      date: "2026-11-28",
      reason: null,
      needsReview: false,
      canCancel: false,
      canMarkReviewed: false,
      manualPaymentBlocked: false,
    },
  ],
};

function ownerScope(): OwnerScope {
  return {
    organization: { id: ORGANIZATION_ID, name: "Club Sintético", defaultCurrency: "EUR" },
    member: { id: "93000000-0000-4000-8000-000000000201", role: "owner", locationScopeMode: "all" },
    locations: [{ id: "93000000-0000-4000-8000-000000000601", name: "Sede Centro" }],
    selectedLocationId: "93000000-0000-4000-8000-000000000601",
    canViewOrganizationAggregate: true,
  };
}

function lastProps<T>(mocked: { mock: { calls: unknown[][] } }): T {
  const calls = mocked.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as T;
}

const renderFeesPage = async () => renderToStaticMarkup(await FamilyFeesPage());
const renderSettingsPage = async () =>
  renderToStaticMarkup(await OwnerSettingsPage({ searchParams: Promise.resolve({ organizationId: ORGANIZATION_ID }) }));
const renderFamiliesPage = async () =>
  renderToStaticMarkup(await OwnerFamiliesPage({ searchParams: Promise.resolve({ organizationId: ORGANIZATION_ID }) }));
const renderPaymentsPage = async () =>
  renderToStaticMarkup(await OwnerPaymentsPage({ searchParams: Promise.resolve({ organizationId: ORGANIZATION_ID }) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://synthetic.supabase.co");
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
  vi.stubEnv("DATABASE_URL_POOL", "");
  vi.stubEnv("DATABASE_URL_DIRECT", "");
  vi.stubEnv("ZALTYKO_CONNECT_ONBOARDING_ENABLED", "true");
  vi.stubEnv(PHASE_FLAG, "true");
  // D2: la domiciliación apagada, como por defecto.
  vi.stubEnv(SEPA_FLAG, "");
  vi.mocked(resolveOwnerScope).mockResolvedValue(ownerScope());
  vi.mocked(getFamilyFees).mockResolvedValue([academy]);
  vi.mocked(getFamilyPaymentMethodState).mockResolvedValue({ kind: "unavailable", reason: "flag_off" } as never);
  vi.mocked(getOwnerFamilyPaymentMethodsView).mockResolvedValue({ visible: true, methods: [listedMethod] });
  vi.mocked(getFamilyAutomaticFeeStatuses).mockResolvedValue({ [INVOICE_ID]: { kind: "in_progress" } });
  vi.mocked(getFamilyAutomaticCollectionModes).mockResolvedValue({
    open: true,
    automaticFamilies: { [ORGANIZATION_ID]: [FAMILY_ID] },
  });
  vi.mocked(getCollectionSettings).mockResolvedValue({ collectionDayOfMonth: 5, version: 2, isDefault: false });
  vi.mocked(getOwnerFamilyCollectionSwitches).mockResolvedValue(switches);
  vi.mocked(getOwnerAutomaticCollections).mockResolvedValue(automaticView);
  vi.mocked(getConnectStatus).mockResolvedValue({ kind: "ready", card: "active", sepa: "active" } as never);
  vi.mocked(getManualPaymentOptions).mockResolvedValue({
    organization: { id: ORGANIZATION_ID, name: "Club Sintético", defaultCurrency: "EUR" },
    locations: [],
    selectedLocationId: null,
    charges: [],
    nextCursor: null,
  } as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const closedCases: Array<[string, () => void]> = [
  ["bandera apagada", () => vi.stubEnv(PHASE_FLAG, "")],
  ["clave Live", () => vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_synthetic")],
  [
    "base de producción",
    () => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`),
  ],
];
/**
 * Solo los cerrojos de R11: el portal y la lista de la academia siguen
 * leyendo con la bandera apagada (la lectura solo devuelve lo que está en marcha).
 */
const lockedCases = closedCases.filter(([label]) => label !== "bandera apagada");

describe("/familia/cuotas: estado del cobro automático", () => {
  it("abierto: pide el estado de las cuotas visibles y se lo pasa a la vista", async () => {
    await renderFeesPage();

    expect(getFamilyAutomaticFeeStatuses).toHaveBeenCalledWith({ userId: USER_ID, invoiceIds: [INVOICE_ID] });
    expect(lastProps<{ automaticCollection: unknown }>(vi.mocked(FamilyFeesView)).automaticCollection).toEqual({
      [INVOICE_ID]: { kind: "in_progress" },
    });
  });

  it.each(lockedCases)("con %s no carga la lectura y no hay estados", async (_label, arrange) => {
    arrange();

    await renderFeesPage();

    expect(getFamilyAutomaticFeeStatuses).not.toHaveBeenCalled();
    expect(lastProps<{ automaticCollection: unknown }>(vi.mocked(FamilyFeesView)).automaticCollection).toEqual({});
  });

  it("con la bandera apagada sigue leyendo: una cuota con un cobro en marcha se ve como «Cobro en curso»", async () => {
    vi.stubEnv(PHASE_FLAG, "");

    await renderFeesPage();

    expect(getFamilyAutomaticFeeStatuses).toHaveBeenCalledWith({ userId: USER_ID, invoiceIds: [INVOICE_ID] });
    expect(lastProps<{ automaticCollection: unknown }>(vi.mocked(FamilyFeesView)).automaticCollection).toEqual({
      [INVOICE_ID]: { kind: "in_progress" },
    });
  });

  it("D2: pasa a la vista si la domiciliación se cobra sola; sin la bandera, no", async () => {
    await renderFeesPage();
    expect(lastProps<{ sepaCollectsAutomatically: unknown }>(vi.mocked(FamilyFeesView)).sepaCollectsAutomatically).toBe(
      false
    );

    vi.stubEnv(SEPA_FLAG, "true");
    await renderFeesPage();
    expect(lastProps<{ sepaCollectsAutomatically: unknown }>(vi.mocked(FamilyFeesView)).sepaCollectsAutomatically).toBe(
      true
    );
  });

  it("sin cuotas no pregunta nada", async () => {
    vi.mocked(getFamilyFees).mockResolvedValue([{ ...academy, fees: [] }]);

    await renderFeesPage();

    expect(getFamilyAutomaticFeeStatuses).not.toHaveBeenCalled();
  });

  it("sin tablas (la lectura no devuelve nada) no hay estados", async () => {
    vi.mocked(getFamilyAutomaticFeeStatuses).mockResolvedValue({});

    await renderFeesPage();

    expect(lastProps<{ automaticCollection: unknown }>(vi.mocked(FamilyFeesView)).automaticCollection).toEqual({});
  });

  it("si la lectura lanza, la página no falla y el registro solo lleva el tipo de error", async () => {
    vi.mocked(getFamilyAutomaticFeeStatuses).mockRejectedValue(new TypeError("detalle interno de la base"));

    await expect(renderFeesPage()).resolves.toEqual(expect.any(String));

    expect(lastProps<{ automaticCollection: unknown }>(vi.mocked(FamilyFeesView)).automaticCollection).toEqual({});
    expect(logger.warn).toHaveBeenCalledWith("family_portal.automatic_collection_state_failed", { errorName: "TypeError" });
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain("detalle interno");
  });
});

describe("/familia/cuotas: la tarjeta «Pago automático» sabe si se cobra sola", () => {
  type ModesProps = { automaticCollectionModes: unknown };

  it("abierto: pide qué familias se cobran solas y se lo pasa a la vista", async () => {
    await renderFeesPage();

    expect(getFamilyAutomaticCollectionModes).toHaveBeenCalledWith({ userId: USER_ID });
    expect(lastProps<ModesProps>(vi.mocked(FamilyFeesView)).automaticCollectionModes).toEqual({
      open: true,
      automaticFamilies: { [ORGANIZATION_ID]: [FAMILY_ID] },
    });
  });

  it.each(closedCases)("con %s no carga la lectura y pasa «cerrado»", async (_label, arrange) => {
    arrange();

    await renderFeesPage();

    expect(getFamilyAutomaticCollectionModes).not.toHaveBeenCalled();
    expect(lastProps<ModesProps>(vi.mocked(FamilyFeesView)).automaticCollectionModes).toEqual({
      open: false,
      automaticFamilies: {},
    });
  });

  it("si la lectura lanza: abierto sin ninguna familia en automático (ni promete ni niega) y solo el tipo de error", async () => {
    vi.mocked(getFamilyAutomaticCollectionModes).mockRejectedValue(new TypeError("detalle interno de la base"));

    await expect(renderFeesPage()).resolves.toEqual(expect.any(String));

    // El error viene de la lectura, no de cargar el módulo.
    expect(getFamilyAutomaticCollectionModes).toHaveBeenCalledWith({ userId: USER_ID });

    expect(lastProps<ModesProps>(vi.mocked(FamilyFeesView)).automaticCollectionModes).toEqual({
      open: true,
      automaticFamilies: {},
    });
    expect(logger.warn).toHaveBeenCalledWith("family_portal.automatic_collection_modes_failed", {
      errorName: "TypeError",
    });
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain("detalle interno");
  });
});

describe("/owner/settings: «Día de cobro»", () => {
  it("abierto: el ajuste va dentro de la tarjeta con lo guardado", async () => {
    const html = await renderSettingsPage();

    expect(getCollectionSettings).toHaveBeenCalledWith({ userId: USER_ID, organizationId: ORGANIZATION_ID });
    expect(html).toContain("tarjeta-cobro-automatico");
    expect(html).toContain("ajuste-dia-de-cobro");
    expect(lastProps<unknown>(vi.mocked(OwnerCollectionDaySettings))).toEqual({
      organizationId: ORGANIZATION_ID,
      initial: { collectionDayOfMonth: 5, version: 2 },
    });
  });

  it.each(closedCases)("con %s no carga el servicio ni pinta el ajuste", async (_label, arrange) => {
    arrange();

    const html = await renderSettingsPage();

    expect(getCollectionSettings).not.toHaveBeenCalled();
    expect(html).not.toContain("ajuste-dia-de-cobro");
  });

  it("sin tablas (el servicio responde «no disponible»): sin ajuste y sin registro", async () => {
    vi.mocked(getCollectionSettings).mockRejectedValue(
      new OperationalError("FEATURE_NOT_AVAILABLE", "El cobro automático de cuotas no está disponible todavía.", 503)
    );

    const html = await renderSettingsPage();

    expect(html).toContain("tarjeta-cobro-automatico");
    expect(html).not.toContain("ajuste-dia-de-cobro");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("si la lectura lanza un error inesperado: la página sigue y solo ids en el registro", async () => {
    vi.mocked(getCollectionSettings).mockRejectedValue(new TypeError("detalle interno de la base"));

    const html = await renderSettingsPage();

    expect(html).not.toContain("ajuste-dia-de-cobro");
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), {
      organizationId: ORGANIZATION_ID,
      errorName: "TypeError",
    });
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain("detalle interno");
  });
});

describe("/owner/familias: «Cobrar automáticamente»", () => {
  it("abierto: pasa los interruptores de las familias con método activo", async () => {
    await renderFamiliesPage();

    expect(getOwnerFamilyCollectionSwitches).toHaveBeenCalledWith({
      userId: USER_ID,
      organizationId: ORGANIZATION_ID,
      familyIds: [FAMILY_ID],
    });
    expect(lastProps<unknown>(vi.mocked(OwnerFamilyPaymentMethodsPanel))).toEqual({
      organizationId: ORGANIZATION_ID,
      methods: [listedMethod],
      // D2: la domiciliación no se cobra sola mientras su bandera siga apagada.
      sepaCollectsAutomatically: false,
      collection: switches,
    });
  });

  it("pasa al panel si la domiciliación se cobra sola (bandera aparte, solo con «true»)", async () => {
    vi.stubEnv(SEPA_FLAG, "true");
    await renderFamiliesPage();
    expect(
      lastProps<{ sepaCollectsAutomatically: unknown }>(vi.mocked(OwnerFamilyPaymentMethodsPanel)).sepaCollectsAutomatically
    ).toBe(true);

    vi.stubEnv(SEPA_FLAG, "1");
    await renderFamiliesPage();
    expect(
      lastProps<{ sepaCollectsAutomatically: unknown }>(vi.mocked(OwnerFamilyPaymentMethodsPanel)).sepaCollectsAutomatically
    ).toBe(false);
  });

  it.each(closedCases)("con %s no hay interruptores", async (_label, arrange) => {
    arrange();

    await renderFamiliesPage();

    expect(getOwnerFamilyCollectionSwitches).not.toHaveBeenCalled();
  });

  it("sin familias con método activo no pregunta", async () => {
    vi.mocked(getOwnerFamilyPaymentMethodsView).mockResolvedValue({ visible: true, methods: [] });

    await renderFamiliesPage();

    expect(getOwnerFamilyCollectionSwitches).not.toHaveBeenCalled();
  });

  it("sin tablas o sin permiso (null): el panel sale sin interruptores", async () => {
    vi.mocked(getOwnerFamilyCollectionSwitches).mockResolvedValue(null);

    const html = await renderFamiliesPage();

    expect(html).toContain("panel-pago-automatico");
    expect(lastProps<Record<string, unknown>>(vi.mocked(OwnerFamilyPaymentMethodsPanel))).not.toHaveProperty("collection");
  });

  it("si la lectura lanza: el panel sale sin interruptores y la página no falla", async () => {
    vi.mocked(getOwnerFamilyCollectionSwitches).mockRejectedValue(new TypeError("detalle interno de la base"));

    const html = await renderFamiliesPage();

    expect(html).toContain("panel-pago-automatico");
    expect(lastProps<Record<string, unknown>>(vi.mocked(OwnerFamilyPaymentMethodsPanel))).not.toHaveProperty("collection");
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), {
      organizationId: ORGANIZATION_ID,
      errorName: "TypeError",
    });
  });
});

describe("/owner/payments: cobros automáticos del mes", () => {
  it("abierto: pinta la lista y avisa al formulario de las cuotas que se están cobrando", async () => {
    const html = await renderPaymentsPage();

    expect(getOwnerAutomaticCollections).toHaveBeenCalledWith({ userId: USER_ID, organizationId: ORGANIZATION_ID });
    expect(html).toContain("cobros-automaticos-del-mes");
    expect(lastProps<{ view: unknown }>(vi.mocked(OwnerAutomaticCollectionsPanel)).view).toEqual(automaticView);
    expect(
      lastProps<{ automaticCollectionInvoiceReferences: unknown }>(vi.mocked(ManualPaymentForm))
        .automaticCollectionInvoiceReferences
    ).toEqual(["CUO-2026-11-001"]);
  });

  it.each(lockedCases)("con %s no carga la lectura ni pinta la lista", async (_label, arrange) => {
    arrange();

    const html = await renderPaymentsPage();

    expect(getOwnerAutomaticCollections).not.toHaveBeenCalled();
    expect(html).not.toContain("cobros-automaticos-del-mes");
    expect(html).toContain("formulario-pago-manual");
  });

  it("con la bandera apagada sigue leyendo: los cobros en marcha salen en la lista", async () => {
    vi.stubEnv(PHASE_FLAG, "");

    const html = await renderPaymentsPage();

    expect(getOwnerAutomaticCollections).toHaveBeenCalledWith({ userId: USER_ID, organizationId: ORGANIZATION_ID });
    expect(html).toContain("cobros-automaticos-del-mes");
    expect(lastProps<{ view: unknown }>(vi.mocked(OwnerAutomaticCollectionsPanel)).view).toEqual(automaticView);
  });

  it("sin tablas o sin permiso (null): sin lista y el formulario sigue", async () => {
    vi.mocked(getOwnerAutomaticCollections).mockResolvedValue(null);

    const html = await renderPaymentsPage();

    expect(html).not.toContain("cobros-automaticos-del-mes");
    expect(html).toContain("formulario-pago-manual");
    expect(
      lastProps<{ automaticCollectionInvoiceReferences: unknown }>(vi.mocked(ManualPaymentForm))
        .automaticCollectionInvoiceReferences
    ).toEqual([]);
  });

  it("si la lectura lanza: se puede seguir registrando pagos y solo ids en el registro", async () => {
    vi.mocked(getOwnerAutomaticCollections).mockRejectedValue(new TypeError("detalle interno de la base"));

    const html = await renderPaymentsPage();

    expect(html).not.toContain("cobros-automaticos-del-mes");
    expect(html).toContain("formulario-pago-manual");
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), {
      organizationId: ORGANIZATION_ID,
      errorName: "TypeError",
    });
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain("detalle interno");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY_ID = "11111111-1111-1111-1111-111111111111";
const SPORT_CONFIG_ID = "22222222-2222-2222-2222-222222222222";
const TENANT_ID = "33333333-3333-3333-3333-333333333333";

const financialStats = {
  totalRevenue: 100,
  paidAmount: 80,
  pendingAmount: 20,
  overdueAmount: 10,
  totalCharges: 2,
  paidCharges: 1,
  pendingCharges: 1,
  overdueCharges: 1,
  averagePaymentTime: 2,
  bySportConfig: [
    {
      sportConfigId: SPORT_CONFIG_ID,
      label: "Femenina · Gimnasia Artística",
      disciplineName: "Gimnasia Artística",
      branchName: "Femenina",
      totalRevenue: 100,
      paidAmount: 80,
      pendingAmount: 20,
      overdueAmount: 10,
      totalCharges: 2,
      paidCharges: 1,
      pendingCharges: 1,
      overdueCharges: 1,
      activeScholarships: 1,
      discountAmount: 5,
      coachCostAmount: 20,
      directExpenseAmount: 10,
      allocatedAcademyExpenseAmount: 5,
      estimatedCostAmount: 35,
      estimatedMarginAmount: 65,
      estimatedMarginRate: 0.65,
      profitabilityStatus: "profitable",
    },
  ],
};

const calculateFinancialStats = vi.fn();
const calculateMonthlyRevenue = vi.fn();
const analyzeDelinquency = vi.fn();
const projectRevenue = vi.fn();

function mockCommonModules() {
  vi.doMock("@/lib/authz", () => ({
    withTenant:
      (handler: (request: Request, context: any) => Promise<Response>) =>
      (request: Request, contextOverride?: Record<string, unknown>) =>
        handler(request, {
          tenantId: TENANT_ID,
          profile: { id: "profile-1", tenantId: TENANT_ID, role: "owner" },
          params: { academyId: ACADEMY_ID },
          ...(contextOverride ?? {}),
        }),
  }));

  vi.doMock("@/lib/reports/financial-calculator", () => ({
    calculateFinancialStats,
    calculateMonthlyRevenue,
    analyzeDelinquency,
    projectRevenue,
  }));

  vi.doMock("@/lib/permissions", () => ({
    verifyAcademyAccessForProfile: vi.fn().mockResolvedValue({ allowed: true }),
  }));
}

describe("financial reports sport config scope", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    calculateFinancialStats.mockResolvedValue(financialStats);
    calculateMonthlyRevenue.mockResolvedValue([]);
    analyzeDelinquency.mockResolvedValue([]);
    projectRevenue.mockResolvedValue([]);
    mockCommonModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("pasa sportConfigId al reporte financiero general", async () => {
    const { GET } = await import("@/app/api/reports/financial/route");
    const response = await GET(
      new Request(
        `http://localhost/api/reports/financial?academyId=${ACADEMY_ID}&sportConfigId=${SPORT_CONFIG_ID}`
      ),
      {} as never
    );

    expect(response.status).toBe(200);
    expect(calculateFinancialStats).toHaveBeenCalledWith(
      expect.objectContaining({
        academyId: ACADEMY_ID,
        tenantId: TENANT_ID,
        sportConfigId: SPORT_CONFIG_ID,
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      data: {
        bySportConfig: [{ sportConfigId: SPORT_CONFIG_ID }],
      },
    });
  });

  it("expone desglose financiero por rama en el dashboard", async () => {
    const { GET } = await import("@/app/api/dashboard/[academyId]/financial-metrics/route");
    const response = await GET(new Request(`http://localhost/api/dashboard/${ACADEMY_ID}/financial-metrics`), {
      params: { academyId: ACADEMY_ID },
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        pendingPayments: 20,
        pendingPaymentsCount: 1,
        activeScholarships: 1,
        bySportConfig: [{ sportConfigId: SPORT_CONFIG_ID, discountAmount: 5, estimatedMarginAmount: 65 }],
      },
    });
  });
});

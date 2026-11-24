import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveOwnerScope: vi.fn(),
  rateLimit: vi.fn(),
  createOrganizationLogoUrl: vi.fn(),
  getOrganizationLogoState: vi.fn(),
  setOrganizationLogoPath: vi.fn(),
  uploadOrganizationLogo: vi.fn(),
  removeOrganizationLogo: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({ resolveOwnerScope: mocks.resolveOwnerScope }));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: () => ({ limit: 10, window: 60 }),
  getVerifiedTenantRateLimitIdentifier: (_request: Request, organizationId: string) => organizationId,
  rateLimit: mocks.rateLimit,
  rateLimitExceededResponse: () => new Response(null, { status: 429 }),
}));
vi.mock("@/modules/organizations/infrastructure/organization-logo-storage", () => ({
  validateOrganizationLogo: vi.fn(),
  organizationLogoPath: vi.fn(),
  getOrganizationLogoState: mocks.getOrganizationLogoState,
  setOrganizationLogoPath: mocks.setOrganizationLogoPath,
  uploadOrganizationLogo: mocks.uploadOrganizationLogo,
  removeOrganizationLogo: mocks.removeOrganizationLogo,
  createOrganizationLogoUrl: mocks.createOrganizationLogoUrl,
  ORGANIZATION_LOGO_UNAVAILABLE_MESSAGE: "El logo del club aún no está disponible",
  isMissingOrganizationLogoColumn: vi.fn(() => false),
}));
vi.mock("@/db", () => ({ db: {} }));

import { DELETE, GET, POST } from "@/app/api/v1/owner/academy-settings/logo/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const ORGANIZATION_A = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "owner-of-b" });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.resolveOwnerScope.mockResolvedValue({
    organization: { id: ORGANIZATION_A },
    member: { role: "owner", locationScopeMode: "all" },
  });
});

describe("organization logo route tenant isolation", () => {
  it("does not read or sign another academy's logo", async () => {
    mocks.resolveOwnerScope.mockRejectedValue(new OperationalError("FORBIDDEN", "Sin acceso", 403));
    const response = await GET(new Request(`https://zaltyko.test/api/v1/owner/academy-settings/logo?organizationId=${ORGANIZATION_A}`));
    expect(response.status).toBe(403);
    expect(mocks.createOrganizationLogoUrl).not.toHaveBeenCalled();
    expect(mocks.uploadOrganizationLogo).not.toHaveBeenCalled();
    expect(mocks.removeOrganizationLogo).not.toHaveBeenCalled();
  });

  it("returns no logo when the candidate column is absent", async () => {
    mocks.getOrganizationLogoState.mockResolvedValue({ available: false, logoPath: null });
    const response = await GET(new Request(`https://zaltyko.test/api/v1/owner/academy-settings/logo?organizationId=${ORGANIZATION_A}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { logoUrl: null, available: false } });
    expect(mocks.createOrganizationLogoUrl).not.toHaveBeenCalled();
  });

  it.each([
    ["POST", async () => {
      const form = new FormData();
      form.set("organizationId", ORGANIZATION_A);
      form.set("file", new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" }), "logo.png");
      return POST(new Request("https://zaltyko.test/api/v1/owner/academy-settings/logo", {
        method: "POST", headers: { origin: "https://zaltyko.test" }, body: form,
      }));
    }],
    ["DELETE", async () => DELETE(new Request("https://zaltyko.test/api/v1/owner/academy-settings/logo", {
      method: "DELETE", headers: { origin: "https://zaltyko.test", "content-type": "application/json" },
      body: JSON.stringify({ organizationId: ORGANIZATION_A }),
    }))],
  ])("returns the migration message from %s without touching storage", async (_method, request) => {
    mocks.getOrganizationLogoState.mockResolvedValue({ available: false, logoPath: null });
    const response = await request();
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("El logo del club aún no está disponible");
    expect(mocks.uploadOrganizationLogo).not.toHaveBeenCalled();
    expect(mocks.removeOrganizationLogo).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveOwnerScope: vi.fn(),
  rateLimit: vi.fn(),
  createOrganizationLogoUrl: vi.fn(),
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
  uploadOrganizationLogo: mocks.uploadOrganizationLogo,
  removeOrganizationLogo: mocks.removeOrganizationLogo,
  createOrganizationLogoUrl: mocks.createOrganizationLogoUrl,
  isMissingOrganizationLogoColumn: vi.fn(() => false),
}));
vi.mock("@/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));

import { GET } from "@/app/api/v1/owner/academy-settings/logo/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const ORGANIZATION_A = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "owner-of-b" });
  mocks.rateLimit.mockResolvedValue({ success: true });
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
});

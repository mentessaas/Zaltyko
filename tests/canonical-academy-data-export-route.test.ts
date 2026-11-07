import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), limit: vi.fn(), exportData: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: mocks.limit,
}));
vi.mock("@/modules/data-rights/application/canonical-academy-return", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/data-rights/application/canonical-academy-return")>()),
  exportCanonicalAcademyData: mocks.exportData,
}));

import { GET } from "@/app/api/v1/owner/data-export/route";
import { CanonicalAcademyExportError } from "@/modules/data-rights/application/canonical-academy-return";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
function requestExport(query = `organizationId=${organizationId}`, headers?: HeadersInit) {
  return new Request(`http://localhost/api/v1/owner/data-export?${query}`, { headers });
}

describe("GET /api/v1/owner/data-export HTTP contract (service mocked)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.user.mockResolvedValue({ id: userId });
    mocks.limit.mockResolvedValue({ success: true, limit: 3, remaining: 2, reset: 123 });
  });

  it("requires authentication before validation, rate limiting or export", async () => {
    mocks.user.mockResolvedValue(null);
    const response = await GET(requestExport("organizationId=invalid"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.exportData).not.toHaveBeenCalled();
  });

  it.each(["", "organizationId=invalid", `organizationId=${organizationId}&organizationId=${organizationId}`])(
    "rejects invalid or ambiguous organization query %s before export", async (query) => {
      expect((await GET(requestExport(query))).status).toBe(400);
      expect(mocks.exportData).not.toHaveBeenCalled();
      expect(mocks.limit).not.toHaveBeenCalled();
    }
  );

  it.each([
    { origin: "https://foreign.example.invalid" },
    { "sec-fetch-site": "cross-site" },
  ] as Record<string, string>[])("rejects cross-origin requests before preparing data", async (headers) => {
    const response = await GET(requestExport(undefined, headers));
    expect(response.status).toBe(403);
    expect(mocks.exportData).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it("returns the exact package bytes with download and private-cache headers", async () => {
    const body = '{"synthetic":"á","data":[]}';
    mocks.exportData.mockResolvedValue({ body, filename: "synthetic-export.json", sizeBytes: Buffer.byteLength(body) });
    const response = await GET(requestExport(undefined, { origin: "http://localhost", "sec-fetch-site": "same-origin" }));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(body);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="synthetic-export.json"');
    expect(response.headers.get("content-length")).toBe(String(Buffer.byteLength(body)));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(mocks.exportData).toHaveBeenCalledWith({ userId, organizationId });
    expect(mocks.limit).toHaveBeenCalledWith({ identifier: `canonical-data-export:user:${userId}`, limit: 3, window: 3600 });
  });

  it("rejects exhausted rate limits before reading data", async () => {
    mocks.limit.mockResolvedValue({ success: false, limit: 3, remaining: 0, reset: Math.ceil(Date.now() / 1000) + 60 });
    const response = await GET(requestExport());
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(mocks.exportData).not.toHaveBeenCalled();
  });

  it.each([403, 404, 413, 503] as const)("preserves service HTTP %s without an attachment", async (status) => {
    mocks.exportData.mockRejectedValue(new CanonicalAcademyExportError(status, "synthetic-export-error", "Safe test failure"));
    const response = await GET(requestExport());
    expect(response.status).toBe(status);
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-type")).toContain("application/problem+json");
  });

  it("hides unexpected infrastructure error details", async () => {
    mocks.exportData.mockRejectedValue(new Error("SYNTHETIC_PRIVATE_DATABASE_DETAIL"));
    const response = await GET(requestExport());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("SYNTHETIC_PRIVATE_DATABASE_DETAIL");
    expect(response.headers.get("content-disposition")).toBeNull();
  });
});

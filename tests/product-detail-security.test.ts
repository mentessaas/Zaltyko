import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
const mocks = vi.hoisted(() => ({ user: vi.fn(), select: vi.fn(), getProduct: vi.fn(), updateProduct: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/store/service", () => ({ getProduct: mocks.getProduct, updateProduct: mocks.updateProduct, deleteProduct: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
import { GET, PATCH } from "@/app/api/products/[id]/route";
const context = { params: { id: "product-a" } };
const request = (body?: unknown) => new NextRequest("https://zaltyko.test/api/products/product-a", {
  method: body ? "PATCH" : "GET", ...(body ? { body: JSON.stringify(body) } : {}),
});
function query(rows: unknown[]) {
  const q: Record<string, any> = {};
  for (const key of ["from", "innerJoin", "where"]) q[key] = vi.fn(() => q);
  q.limit = vi.fn().mockResolvedValue(rows);
  return q;
}
describe("product detail security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(sql, { raw: vi.fn((value: string) => value) });
    mocks.user.mockResolvedValue(null);
    mocks.getProduct.mockResolvedValue({ id: "product-a", academyId: "academy-a", tenantId: "tenant-a", name: "Test", isActive: true, visibility: "public", publishedAt: new Date(), metadata: { internal: "private" } });
  });
  it.each([
    { visibility: "members_only" }, { isActive: false }, { publishedAt: null },
  ])("does not expose an unpublished or restricted product: %j", async (patch) => {
    mocks.getProduct.mockResolvedValue({ ...(await mocks.getProduct()), ...patch });
    expect((await GET(request(), context)).status).toBe(404);
  });
  it("returns only the public projection to anonymous readers", async () => {
    const response = await GET(request(), context);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ id: "product-a", name: "Test" });
    expect(body).not.toHaveProperty("tenantId");
    expect(body).not.toHaveProperty("metadata");
  });
  it("lets the owner read an inactive product", async () => {
    mocks.user.mockResolvedValue({ id: "owner-a" });
    mocks.select.mockReturnValue(query([{ id: "academy-a" }]));
    mocks.getProduct.mockResolvedValue({ id: "product-a", academyId: "academy-a", isActive: false });
    expect((await GET(request(), context)).status).toBe(200);
  });
  it.each([{ academyId: "academy-b" }, { tenantId: "tenant-b" }, { id: "product-b" }, { priceCents: -1 }])(
    "rejects protected fields and invalid prices: %j", async (body) => {
      mocks.user.mockResolvedValue({ id: "owner-a" });
      mocks.select.mockReturnValue(query([{ id: "academy-a", academyId: "academy-a" }]));
      expect((await PATCH(request(body), context)).status).toBe(400);
      expect(mocks.updateProduct).not.toHaveBeenCalled();
    }
  );
  it("preserves the owner's supported activation action", async () => {
    mocks.user.mockResolvedValue({ id: "owner-a" });
    mocks.select.mockReturnValue(query([{ id: "academy-a", academyId: "academy-a" }]));
    mocks.updateProduct.mockResolvedValue({ id: "product-a", isActive: false });
    expect((await PATCH(request({ isActive: false }), context)).status).toBe(200);
    expect(mocks.updateProduct).toHaveBeenCalledWith("product-a", { isActive: false });
  });
});

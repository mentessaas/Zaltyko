import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));

import { GET } from "@/app/api/products/[id]/variants/route";

function query(rows: unknown[]) {
  const q: Record<string, unknown> = {};
  for (const operation of ["from", "where", "orderBy"]) q[operation] = vi.fn(() => q);
  q.limit = vi.fn().mockResolvedValue(rows);
  return q;
}

describe("public product variants", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["missing", []],
    ["restricted", []],
    ["draft", []],
  ])("does not query variants when the parent is %s", async (_state, parent) => {
    mocks.select.mockReturnValueOnce(query(parent));

    const response = await GET(
      new NextRequest("https://zaltyko.test/api/products/product-a/variants"),
      { params: { id: "product-a" } }
    );

    expect(response.status).toBe(404);
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it("returns only active variants of an explicitly published product", async () => {
    const variants = [{ id: "variant-a", name: "Talla S", isActive: true }];
    mocks.select
      .mockReturnValueOnce(query([{ id: "product-a" }]))
      .mockReturnValueOnce(query(variants));

    const response = await GET(
      new NextRequest("https://zaltyko.test/api/products/product-a/variants"),
      { params: { id: "product-a" } }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(variants);
  });
});

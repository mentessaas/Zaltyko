import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[][],
  chains: [] as Array<Record<string, any>>,
  select: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/public/demo-listings", () => ({
  canUsePublicDemoData: (id: string) => id === "demo-listing",
  demoMarketplaceListing: {
    id: "demo-listing",
    title: "Producto de demostración",
    type: "product",
    category: "equipment",
    priceType: "contact",
    images: [],
  },
}));

function queryChain(result: unknown[]) {
  const query: Record<string, any> = {};
  for (const method of ["from", "where", "orderBy", "limit", "offset"]) {
    query[method] = vi.fn(() => query);
  }
  Object.defineProperty(query, "then", {
    value: (
      resolve: (value: unknown[]) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  });
  mocks.chains.push(query);
  return query;
}

import { listActivePublicAds } from "@/lib/advertising/public-ads";
import {
  getPublicLegacyMarketplaceListing,
  listPublicLegacyMarketplace,
} from "@/lib/marketplace/legacy-catalog";

describe("legacy public catalog", () => {
  beforeEach(() => {
    mocks.rows = [];
    mocks.chains = [];
    mocks.select.mockImplementation(() => queryChain(mocks.rows.shift() ?? []));
    vi.stubEnv("NODE_ENV", "production");
  });

  it("bounds list reads and returns stable pagination metadata", async () => {
    mocks.rows = [[{ id: "listing-21" }], [{ count: 21 }]];

    const result = await listPublicLegacyMarketplace(
      new URLSearchParams(
        "category=equipment&category=books&type=product&type=service&search=malla&page=2&limit=10"
      )
    );

    expect(result).toMatchObject({
      items: [{ id: "listing-21" }],
      total: 21,
      page: 2,
      pageSize: 10,
      totalPages: 3,
    });
    expect(mocks.chains[0].limit).toHaveBeenCalledWith(10);
    expect(mocks.chains[0].offset).toHaveBeenCalledWith(10);
    expect(mocks.chains[1].limit).toHaveBeenCalledWith(1);
  });

  it("shows demo data only in development on an unfiltered first page", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mocks.rows = [[], [{ count: 0 }]];

    await expect(
      listPublicLegacyMarketplace(new URLSearchParams())
    ).resolves.toMatchObject({
      items: [{ id: "demo-listing" }],
      total: 1,
      page: 1,
    });
  });

  it("exposes only active legacy listings in the public detail lookup", async () => {
    mocks.rows = [[{ id: "listing-active", status: "active" }]];

    await expect(
      getPublicLegacyMarketplaceListing("listing-active")
    ).resolves.toMatchObject({
      id: "listing-active",
      status: "active",
    });
    expect(mocks.chains[0].limit).toHaveBeenCalledWith(1);
  });

  it("does not query ads for an invalid placement and bounds valid placements", async () => {
    await expect(listActivePublicAds("unknown-zone")).resolves.toEqual([]);
    expect(mocks.select).not.toHaveBeenCalled();

    mocks.rows = [[{ id: "ad-1" }]];
    await expect(listActivePublicAds("marketplace_top")).resolves.toEqual([
      { id: "ad-1" },
    ]);
    expect(mocks.chains[0].limit).toHaveBeenCalledWith(10);
  });
});

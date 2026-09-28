import { describe, expect, it } from "vitest";

import { isExperimentalRouteDisabled } from "@/lib/release/experimental-routes";

const disabled = { academyMarketplace: false, b2bStore: false, actorPages: false };

describe("stable release route cut", () => {
  it("preserves the live legacy marketplace and its user-owned routes", () => {
    for (const path of [
      "/marketplace",
      "/marketplace/nuevo",
      "/marketplace/123e4567-e89b-42d3-a456-426614174000",
      "/api/marketplace",
      "/api/marketplace/123e4567-e89b-42d3-a456-426614174000",
      "/api/marketplace/123e4567-e89b-42d3-a456-426614174000/ratings",
      "/api/marketplace/mis-productos",
      "/api/marketplace/mis-productos/123e4567-e89b-42d3-a456-426614174000",
    ]) {
      expect(isExperimentalRouteDisabled(path, disabled), path).toBe(false);
    }
  });

  it("blocks unfinished B2B, store, actor and sitemap routes by default", () => {
    for (const path of [
      "/academy-marketplace",
      "/marketplace/orders/order-id/success",
      "/admin/disputes",
      "/api/admin/disputes",
      "/app/academy-id/marketplace",
      "/api/marketplace/search",
      "/api/marketplace/listings/listing-id",
      "/api/marketplace/disputes/dispute-id",
      "/api/products/product-id/variants",
      "/api/checkout",
      "/api/academy/stripe-connect/onboard",
      "/app/academy-id/store",
      "/a/academy-slug/tienda",
      "/a/academy-slug",
      "/api/actor-pages/page-id",
      "/api/actor-consents",
      "/api/academy/subdomain",
      "/app/academy-id/public-page",
      "/app/academy-id/privacy",
      "/app/academy-id/subdomain",
      "/app/academy-id/audit-timeline",
      "/app/athlete/athlete-id/public-page",
      "/sitemap-actor-pages.xml",
      "/sitemap-actor-pages/1",
    ]) {
      expect(isExperimentalRouteDisabled(path, disabled), path).toBe(true);
    }
  });

  it("enables each module only with its own explicit server flag", () => {
    expect(isExperimentalRouteDisabled("/api/products", { ...disabled, b2bStore: true })).toBe(false);
    expect(isExperimentalRouteDisabled("/api/academy/stripe-connect/onboard", { ...disabled, b2bStore: true })).toBe(false);
    expect(isExperimentalRouteDisabled("/api/actor-pages", { ...disabled, actorPages: true })).toBe(false);
    expect(isExperimentalRouteDisabled("/api/academy/subdomain", { ...disabled, actorPages: true })).toBe(false);
    expect(isExperimentalRouteDisabled("/academy-marketplace", { ...disabled, academyMarketplace: true })).toBe(false);
    expect(isExperimentalRouteDisabled("/api/checkout", { ...disabled, academyMarketplace: true })).toBe(true);
  });
});

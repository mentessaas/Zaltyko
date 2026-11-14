import { describe, expect, it, vi } from "vitest";

// The kit page renders directory widgets; only its metadata matters here.
vi.mock("@/components/directory/DirectoryMeasurement", () => ({ DirectoryMeasurement: () => null }));
vi.mock("@/components/directory/SubscriptionForm", () => ({ SubscriptionForm: () => null }));
vi.mock("@/lib/directory/contracts", () => ({ flag: () => false }));
vi.mock("@/lib/seo/site-url", () => ({ getPublicSiteUrl: () => "https://zaltyko.com" }));

import { metadata as preferencesMetadata } from "@/app/preferences/layout";
import { metadata as unsubscribeMetadata } from "@/app/unsubscribe/layout";
import { metadata as kitMetadata } from "@/app/recursos/kit-academias/page";

// Pages that must stay out of search results (SEO, 2026-11-12). Reverting any
// of these directives must fail this test.
describe("non-indexable public pages", () => {
  it.each([
    ["/preferences", preferencesMetadata],
    ["/unsubscribe", unsubscribeMetadata],
  ])("%s is noindex, nofollow", (_path, metadata) => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("/recursos/kit-academias is noindex but keeps its links followable", () => {
    expect(kitMetadata.robots).toEqual({ index: false, follow: true });
    expect(kitMetadata.alternates).toEqual({ canonical: "https://zaltyko.com/recursos/kit-academias" });
  });
});

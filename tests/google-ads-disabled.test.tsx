// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

afterEach(async () => {
  cleanup();
  Reflect.deleteProperty(window, "gtag");
  const { __resetConsentForTests } = await import("@/lib/consent/store");
  __resetConsentForTests();
  vi.unstubAllEnvs();
});

it("does not load or emit Google Ads even when an ID, flag, and analytics consent exist", async () => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DISABLE_ANALYTICS", "false");
  vi.stubEnv("NEXT_PUBLIC_ENABLE_GOOGLE_ADS", "true");
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_ID", "AW-123456789");

  const store = await import("@/lib/consent/store");
  const { GoogleAdsTracking } = await import("@/components/GoogleAdsTracking");
  const { isGoogleAdsEnabled, trackGoogleAdsConversion } = await import(
    "@/lib/google-ads"
  );
  const gtag = vi.fn();
  Object.assign(window, { gtag });
  store.writeConsent("granted");

  const view = render(<GoogleAdsTracking nonce="synthetic-nonce" />);
  trackGoogleAdsConversion("synthetic_conversion");

  expect(isGoogleAdsEnabled()).toBe(false);
  expect(document.querySelector('script[src*="googletagmanager.com"]')).toBe(
    null
  );
  expect(gtag).not.toHaveBeenCalled();
  view.unmount();
});

// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CONSENTED_UTM_STORAGE_KEY } from "@/lib/growth/consented-attribution";

const route = vi.hoisted(() => ({ pathname: "/pricing" }));

vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
}));

afterEach(async () => {
  cleanup();
  const { __resetConsentForTests } = await import("@/lib/consent/store");
  __resetConsentForTests();
  vi.unstubAllEnvs();
  route.pathname = "/pricing";
  window.sessionStorage.removeItem("zaltyko_first_touch_utm");
  window.sessionStorage.removeItem(CONSENTED_UTM_STORAGE_KEY);
  window.sessionStorage.removeItem("zaltyko:owner-onboarding-draft:v1");
  window.history.replaceState({}, "", "/");
});

it("captures a public first touch only after explicit consent and the attribution flag", async () => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_ENABLE_UTM_ATTRIBUTION", "true");
  window.history.replaceState(
    {},
    "",
    "/pricing?utm_source=public&utm_campaign=launch"
  );
  const store = await import("@/lib/consent/store");
  const { UtmCapture } = await import("@/components/growth/UtmCapture");
  store.writeConsent("granted");

  render(<UtmCapture />);

  await waitFor(() => {
    expect(window.sessionStorage.getItem(CONSENTED_UTM_STORAGE_KEY)).toContain(
      '"utm_source":"public"'
    );
  });
});

it("clears only first-touch attribution on revoke and never captures a private query", async () => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_ENABLE_UTM_ATTRIBUTION", "true");
  route.pathname = "/owner/attendance";
  window.history.replaceState(
    {},
    "",
    "/owner/attendance?utm_source=private"
  );
  window.sessionStorage.setItem(
    CONSENTED_UTM_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      provenance: "public_route_with_analytics_consent",
      utm: { utm_source: "prior_public" },
    })
  );
  window.sessionStorage.setItem(
    "zaltyko_first_touch_utm",
    JSON.stringify({ utm_source: "legacy" })
  );
  window.sessionStorage.setItem("zaltyko:owner-onboarding-draft:v1", "draft");
  const store = await import("@/lib/consent/store");
  const { UtmCapture } = await import("@/components/growth/UtmCapture");
  store.writeConsent("granted");

  render(<UtmCapture />);
  await act(async () => {
    await Promise.resolve();
  });

  expect(window.sessionStorage.getItem("zaltyko_first_touch_utm")).toBe(null);
  expect(window.sessionStorage.getItem(CONSENTED_UTM_STORAGE_KEY)).toContain(
    '"utm_source":"prior_public"'
  );

  act(() => store.writeConsent("revoked"));

  expect(window.sessionStorage.getItem("zaltyko_first_touch_utm")).toBe(null);
  expect(window.sessionStorage.getItem(CONSENTED_UTM_STORAGE_KEY)).toBe(null);
  expect(window.sessionStorage.getItem("zaltyko:owner-onboarding-draft:v1")).toBe(
    "draft"
  );
});

it("does not retain a captured UTM when the feature flag is off", async () => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_ENABLE_UTM_ATTRIBUTION", "false");
  window.history.replaceState({}, "", "/pricing?utm_source=public");
  window.sessionStorage.setItem(
    "zaltyko_first_touch_utm",
    JSON.stringify({ utm_source: "old" })
  );
  window.sessionStorage.setItem(
    CONSENTED_UTM_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      provenance: "public_route_with_analytics_consent",
      utm: { utm_source: "old" },
    })
  );
  const store = await import("@/lib/consent/store");
  const { UtmCapture } = await import("@/components/growth/UtmCapture");
  store.writeConsent("granted");

  render(<UtmCapture />);

  await waitFor(() => {
    expect(window.sessionStorage.getItem("zaltyko_first_touch_utm")).toBe(null);
    expect(window.sessionStorage.getItem(CONSENTED_UTM_STORAGE_KEY)).toBe(null);
  });
});

// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/owner/attendance",
  analyticsModuleLoaded: vi.fn(),
  speedModuleLoaded: vi.fn(),
  analyticsRendered: vi.fn(),
  speedRendered: vi.fn(),
  analyticsBeforeSend: null as
    | ((event: { type: "pageview" | "event"; url: string }) => unknown)
    | null,
  speedBeforeSend: null as
    | ((event: { type: "vital"; url: string; route?: string }) => unknown)
    | null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("@vercel/analytics/react", () => {
  mocks.analyticsModuleLoaded();
  return {
    Analytics: (props: {
      beforeSend: (event: {
        type: "pageview" | "event";
        url: string;
      }) => unknown;
    }) => {
      mocks.analyticsRendered();
      mocks.analyticsBeforeSend = props.beforeSend;
      return null;
    },
  };
});

vi.mock("@vercel/speed-insights/next", () => {
  mocks.speedModuleLoaded();
  return {
    SpeedInsights: (props: {
      beforeSend: (event: {
        type: "vital";
        url: string;
        route?: string;
      }) => unknown;
    }) => {
      mocks.speedRendered();
      mocks.speedBeforeSend = props.beforeSend;
      return null;
    },
  };
});

afterEach(async () => {
  cleanup();
  const { __resetConsentForTests } = await import("@/lib/consent/store");
  __resetConsentForTests();
  vi.unstubAllEnvs();
  mocks.pathname = "/owner/attendance";
  mocks.analyticsModuleLoaded.mockClear();
  mocks.speedModuleLoaded.mockClear();
  mocks.analyticsRendered.mockClear();
  mocks.speedRendered.mockClear();
  mocks.analyticsBeforeSend = null;
  mocks.speedBeforeSend = null;
  window.history.replaceState({}, "", "/");
});

function enableVercelProviders() {
  vi.stubEnv("NEXT_PUBLIC_DISABLE_ANALYTICS", "false");
  vi.stubEnv("NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS", "true");
  vi.stubEnv("NEXT_PUBLIC_ENABLE_SPEED_INSIGHTS", "true");
}

it("does not import Vercel SDKs on a private route after consent is granted", async () => {
  vi.resetModules();
  enableVercelProviders();
  const store = await import("@/lib/consent/store");
  const { OptionalTelemetryBoundary } = await import(
    "@/components/OptionalTelemetryBoundary"
  );
  store.writeConsent("granted");
  render(<OptionalTelemetryBoundary>Owner</OptionalTelemetryBoundary>);

  await act(async () => {
    await Promise.resolve();
  });
  expect(mocks.analyticsModuleLoaded).not.toHaveBeenCalled();
  expect(mocks.speedModuleLoaded).not.toHaveBeenCalled();
  expect(mocks.analyticsRendered).not.toHaveBeenCalled();
  expect(mocks.speedRendered).not.toHaveBeenCalled();
});

it("loads only after consent on a public route and drops a late private-route send", async () => {
  vi.resetModules();
  enableVercelProviders();
  mocks.pathname = "/pricing";
  window.history.replaceState({}, "", "/pricing");
  const store = await import("@/lib/consent/store");
  const { OptionalTelemetryBoundary } = await import(
    "@/components/OptionalTelemetryBoundary"
  );
  store.writeConsent("granted");
  const view = render(
    <OptionalTelemetryBoundary>Pricing</OptionalTelemetryBoundary>
  );

  await waitFor(() => {
    expect(mocks.analyticsModuleLoaded).toHaveBeenCalledTimes(1);
    expect(mocks.speedModuleLoaded).toHaveBeenCalledTimes(1);
    expect(mocks.analyticsBeforeSend).toBeTypeOf("function");
    expect(mocks.speedBeforeSend).toBeTypeOf("function");
  });

  act(() => {
    mocks.pathname = "/owner/attendance";
    window.history.replaceState({}, "", "/owner/attendance?session=secret");
  });
  view.rerender(<OptionalTelemetryBoundary>Owner</OptionalTelemetryBoundary>);

  const privateEvent = {
    url: `${window.location.origin}/pricing?email=family@example.test`,
  };
  expect(
    mocks.analyticsBeforeSend?.({ type: "pageview", ...privateEvent })
  ).toBe(null);
  expect(
    mocks.speedBeforeSend?.({ type: "vital", route: "/pricing", ...privateEvent })
  ).toBe(null);
  view.unmount();
});


it("keeps optional SDK components unmounted on a public route when flags are absent", async () => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DISABLE_ANALYTICS", "false");
  vi.stubEnv("NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS", undefined);
  vi.stubEnv("NEXT_PUBLIC_ENABLE_SPEED_INSIGHTS", undefined);
  mocks.pathname = "/pricing";
  window.history.replaceState({}, "", "/pricing");
  const store = await import("@/lib/consent/store");
  const { OptionalTelemetryBoundary } = await import("@/components/OptionalTelemetryBoundary");
  store.writeConsent("granted");
  render(<OptionalTelemetryBoundary>Pricing</OptionalTelemetryBoundary>);
  await act(async () => { await Promise.resolve(); });
  expect(mocks.analyticsRendered).not.toHaveBeenCalled();
  expect(mocks.speedRendered).not.toHaveBeenCalled();
});

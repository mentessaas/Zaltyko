// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const importStarted = vi.fn();
  const posthog = {
    init: vi.fn(),
    capture: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    debug: vi.fn(),
  };

  return {
    posthog,
    importStarted,
    async importPostHog() {
      importStarted();
      return { default: posthog, posthog };
    },
    reset() {
      importStarted.mockReset();
      posthog.init.mockReset();
      posthog.capture.mockReset();
      posthog.opt_in_capturing.mockReset();
      posthog.opt_out_capturing.mockReset();
      posthog.debug.mockReset();
    },
  };
});

vi.mock("posthog-js", async () => mocks.importPostHog());
vi.mock("@/lib/growth/events", () => ({
  recordGrowthEvent: vi.fn(async () => undefined),
}));

async function loadConsentAndAnalytics() {
  const store = await import("@/lib/consent/store");
  const analytics = await import("@/lib/analytics");
  const { PostHogProvider } = await import("@/components/PostHogProvider");
  return { store, analytics, PostHogProvider };
}

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DISABLE_ANALYTICS", "false");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_synthetic_test_key");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://posthog.test.invalid");
  vi.stubGlobal("window", window);
  mocks.reset();
  window.localStorage.clear();
  const { store } = await loadConsentAndAnalytics();
  store.writeConsent("unset");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("analytics consent gate", () => {
  it("does not import, initialize, or capture while consent is unset or revoked", async () => {
    const { store, analytics, PostHogProvider } =
      await loadConsentAndAnalytics();
    const view = render(<PostHogProvider>Contenido</PostHogProvider>);

    await analytics.initAnalytics();
    await analytics.trackPageView("/private");
    await analytics.trackEvent("test_event");
    expect(mocks.importStarted).not.toHaveBeenCalled();
    expect(mocks.posthog.init).not.toHaveBeenCalled();
    expect(mocks.posthog.capture).not.toHaveBeenCalled();

    view.unmount();
    store.writeConsent("revoked");
    await analytics.initAnalytics();
    await analytics.trackPageView("/private");
    await analytics.trackEvent("test_event");
    expect(mocks.importStarted).not.toHaveBeenCalled();
    expect(mocks.posthog.init).not.toHaveBeenCalled();
    expect(mocks.posthog.capture).not.toHaveBeenCalled();
  });

  it("initializes and captures only after an explicit grant", async () => {
    const { store, PostHogProvider } = await loadConsentAndAnalytics();
    store.writeConsent("granted");
    render(<PostHogProvider>Contenido</PostHogProvider>);

    await waitFor(() => expect(mocks.posthog.init).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mocks.posthog.capture).toHaveBeenCalledWith(
        "$pageview",
        expect.objectContaining({ path: "/" })
      )
    );
    const [, config] = mocks.posthog.init.mock.calls[0];
    expect(config).toMatchObject({
      opt_out_capturing_by_default: true,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
    });
    expect(mocks.posthog.opt_in_capturing).toHaveBeenCalledTimes(1);
  });

  it("blocks by default and handles deny, grant, revoke, and regrant", async () => {
    const { store, PostHogProvider } = await loadConsentAndAnalytics();
    const view = render(<PostHogProvider>Contenido</PostHogProvider>);
    expect(mocks.importStarted).not.toHaveBeenCalled();

    act(() => store.writeConsent("granted"));
    await waitFor(() => expect(mocks.posthog.init).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.posthog.capture).toHaveBeenCalledTimes(1));

    act(() => store.writeConsent("revoked"));
    expect(mocks.posthog.opt_out_capturing).toHaveBeenCalledTimes(1);
    const countBeforeRegrant = mocks.posthog.capture.mock.calls.length;

    act(() => store.writeConsent("granted"));
    await waitFor(() =>
      expect(mocks.posthog.opt_in_capturing).toHaveBeenCalledTimes(2)
    );
    expect(mocks.posthog.init).toHaveBeenCalledTimes(1);
    expect(mocks.posthog.capture).toHaveBeenCalledTimes(countBeforeRegrant);
    view.unmount();
  });

  it("opts out after revoke and blocks later browser events", async () => {
    const { store, analytics, PostHogProvider } =
      await loadConsentAndAnalytics();
    store.writeConsent("granted");
    render(<PostHogProvider>Contenido</PostHogProvider>);
    await waitFor(() => expect(mocks.posthog.init).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.posthog.capture).toHaveBeenCalledTimes(1));

    act(() => store.writeConsent("revoked"));
    expect(mocks.posthog.opt_out_capturing).toHaveBeenCalledTimes(1);
    const captureCount = mocks.posthog.capture.mock.calls.length;
    await analytics.trackPageView("/after-revoke");
    await analytics.trackEvent("after_revoke");
    expect(mocks.posthog.capture).toHaveBeenCalledTimes(captureCount);
  });

  it("honors NEXT_PUBLIC_DISABLE_ANALYTICS before import, init, and capture", async () => {
    vi.stubEnv("NEXT_PUBLIC_DISABLE_ANALYTICS", "true");
    vi.resetModules();
    const { store, analytics, PostHogProvider } =
      await loadConsentAndAnalytics();
    store.writeConsent("granted");
    render(<PostHogProvider>Contenido</PostHogProvider>);

    await analytics.initAnalytics();
    await analytics.trackPageView("/");
    await analytics.trackEvent("disabled_test");
    expect(mocks.importStarted).not.toHaveBeenCalled();
    expect(mocks.posthog.init).not.toHaveBeenCalled();
    expect(mocks.posthog.capture).not.toHaveBeenCalled();
  });

  it("keeps server first-party growth events independent from browser consent", async () => {
    vi.stubGlobal("window", undefined);
    vi.resetModules();
    const { analytics } = await loadConsentAndAnalytics();

    await analytics.initAnalytics();
    await analytics.trackPageView("/server-render");
    await analytics.trackEvent("owner_invite_sent", {
      userId: "synthetic-user",
      academyId: "synthetic-academy",
      idempotencyKey: "synthetic-event-key",
      metadata: { channel: "internal" },
    });

    const { recordGrowthEvent } = await import("@/lib/growth/events");
    expect(recordGrowthEvent).toHaveBeenCalledWith({
      eventName: "owner_invite_sent",
      userId: "synthetic-user",
      academyId: "synthetic-academy",
      tenantId: null,
      source: "authenticated",
      properties: { channel: "internal" },
      idempotencyKey: "synthetic-event-key",
    });
    expect(mocks.importStarted).not.toHaveBeenCalled();
  });
});

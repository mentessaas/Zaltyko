// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.doUnmock("posthog-js");
  vi.unstubAllEnvs();
});

it("does not initialize or capture if consent is revoked during PostHog import", async () => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DISABLE_ANALYTICS", "false");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_synthetic_race_test_key");

  let releaseImport!: () => void;
  let finishImport!: () => void;
  const importGate = new Promise<void>((resolve) => {
    releaseImport = resolve;
  });
  const importCompleted = new Promise<void>((resolve) => {
    finishImport = resolve;
  });
  const importStarted = vi.fn();
  const posthog = {
    init: vi.fn(),
    capture: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    debug: vi.fn(),
  };

  vi.doMock("posthog-js", async () => {
    importStarted();
    await importGate;
    finishImport();
    return { default: posthog, posthog };
  });

  const store = await import("@/lib/consent/store");
  const analytics = await import("@/lib/analytics");
  const { PostHogProvider } = await import("@/components/PostHogProvider");
  store.writeConsent("unset");
  store.writeConsent("granted");
  render(<PostHogProvider>Contenido</PostHogProvider>);
  await waitFor(() => expect(importStarted).toHaveBeenCalledTimes(1));
  const pendingEvent = analytics.trackEvent("during_import");

  act(() => store.writeConsent("revoked"));
  releaseImport();
  await Promise.all([pendingEvent, importCompleted]);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(posthog.init).not.toHaveBeenCalled();
  expect(posthog.capture).not.toHaveBeenCalled();
  expect(posthog.opt_out_capturing).not.toHaveBeenCalled();
  await analytics.trackPageView("/after-revoke");
  await analytics.trackEvent("after_revoke");
  expect(posthog.capture).not.toHaveBeenCalled();
});

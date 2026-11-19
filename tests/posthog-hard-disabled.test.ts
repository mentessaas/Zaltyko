import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("keeps PostHog disabled even when the public enable flag is true", async () => {
  vi.stubEnv("NEXT_PUBLIC_DISABLE_ANALYTICS", "false");
  vi.stubEnv("NEXT_PUBLIC_ENABLE_POSTHOG", "true");
  vi.resetModules();

  const { optionalTrackingFlags } = await import(
    "@/lib/optional-tracking-policy"
  );

  expect(optionalTrackingFlags.posthog).toBe(false);
});

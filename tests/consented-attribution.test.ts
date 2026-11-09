import { afterEach, describe, expect, it, vi } from "vitest";

import {
  capturePublicFirstTouchUtm,
  clearFirstTouchUtm,
  CONSENTED_UTM_STORAGE_KEY,
  isUtmAttributionEnabled,
  readConsentedFirstTouchUtm,
  syncConsentedFirstTouchUtm,
  type ConsentedAttributionStorage,
} from "@/lib/growth/consented-attribution";
import { UTM_STORAGE_KEY } from "@/lib/growth/utm";

class MemoryStorage implements ConsentedAttributionStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("consented first-touch attribution", () => {
  it("is disabled by default and requires the exact opt-in flag", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_UTM_ATTRIBUTION", undefined);
    expect(isUtmAttributionEnabled()).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_ENABLE_UTM_ATTRIBUTION", "true");
    expect(isUtmAttributionEnabled()).toBe(true);

    vi.stubEnv("NEXT_PUBLIC_ENABLE_UTM_ATTRIBUTION", "1");
    expect(isUtmAttributionEnabled()).toBe(false);
  });

  it("captures only with flag, granted consent, and an exact public route", () => {
    const storage = new MemoryStorage();
    const source = {
      enabled: true,
      consentGranted: true,
      pathname: "/pricing",
      search: "?utm_source=campaign&utm_campaign=autumn",
      storage,
    };

    expect(capturePublicFirstTouchUtm({ ...source, enabled: false })).toBe(false);
    expect(
      capturePublicFirstTouchUtm({ ...source, consentGranted: false })
    ).toBe(false);
    expect(
      capturePublicFirstTouchUtm({ ...source, pathname: "/owner/attendance" })
    ).toBe(false);
    expect(storage.getItem(UTM_STORAGE_KEY)).toBe(null);
    expect(storage.getItem(CONSENTED_UTM_STORAGE_KEY)).toBe(null);

    expect(capturePublicFirstTouchUtm(source)).toBe(true);
    expect(storage.getItem(CONSENTED_UTM_STORAGE_KEY)).toContain(
      '"utm_source":"campaign"'
    );
    expect(storage.getItem(CONSENTED_UTM_STORAGE_KEY)).toContain(
      '"provenance":"public_route_with_analytics_consent"'
    );
  });

  it("preserves first touch and exposes only sanitized stored values to onboarding", () => {
    const storage = new MemoryStorage();
    capturePublicFirstTouchUtm({
      enabled: true,
      consentGranted: true,
      pathname: "/pricing",
      search: "?utm_source=first&utm_campaign=launch",
      storage,
    });
    capturePublicFirstTouchUtm({
      enabled: true,
      consentGranted: true,
      pathname: "/",
      search: "?utm_source=second&utm_term=person@example.test",
      storage,
    });

    expect(
      readConsentedFirstTouchUtm({
        enabled: false,
        consentGranted: true,
        storage,
      })
    ).toBeUndefined();
    expect(
      readConsentedFirstTouchUtm({
        enabled: true,
        consentGranted: false,
        storage,
      })
    ).toBeUndefined();
    expect(
      readConsentedFirstTouchUtm({
        enabled: true,
        consentGranted: true,
        storage,
      })
    ).toEqual({ utm_source: "first", utm_campaign: "launch" });
  });

  it("ignores and removes legacy values, then reads a new public consented capture", () => {
    const storage = new MemoryStorage();
    storage.setItem(UTM_STORAGE_KEY, JSON.stringify({ utm_source: "legacy" }));

    expect(
      readConsentedFirstTouchUtm({
        enabled: true,
        consentGranted: true,
        storage,
      })
    ).toBeUndefined();

    syncConsentedFirstTouchUtm({
      enabled: true,
      consent: "granted",
      pathname: "/pricing",
      search: "?utm_source=current&utm_campaign=launch",
      storage,
    });

    expect(storage.getItem(UTM_STORAGE_KEY)).toBe(null);
    expect(
      readConsentedFirstTouchUtm({
        enabled: true,
        consentGranted: true,
        storage,
      })
    ).toEqual({ utm_source: "current", utm_campaign: "launch" });
  });

  it("does not capture a private-route query and preserves earlier public first touch", () => {
    const storage = new MemoryStorage();
    storage.setItem(UTM_STORAGE_KEY, JSON.stringify({ utm_source: "legacy" }));
    storage.setItem(
      CONSENTED_UTM_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        provenance: "public_route_with_analytics_consent",
        utm: { utm_source: "public" },
      })
    );

    syncConsentedFirstTouchUtm({
      enabled: true,
      consent: "granted",
      pathname: "/owner/attendance",
      search: "?utm_source=private",
      storage,
    });

    expect(storage.getItem(UTM_STORAGE_KEY)).toBe(null);
    expect(storage.getItem(CONSENTED_UTM_STORAGE_KEY)).toContain('"utm_source":"public"');
    expect(
      readConsentedFirstTouchUtm({
        enabled: true,
        consentGranted: true,
        storage,
      })
    ).toEqual({ utm_source: "public" });
  });

  it("revocation removes only UTM attribution keys and leaves unrelated drafts intact", () => {
    const storage = new MemoryStorage();
    storage.setItem(UTM_STORAGE_KEY, JSON.stringify({ utm_source: "public" }));
    storage.setItem(
      CONSENTED_UTM_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        provenance: "public_route_with_analytics_consent",
        utm: { utm_source: "public" },
      })
    );
    storage.setItem("zaltyko:owner-onboarding-draft:v1", "draft");
    storage.setItem("another-session-key", "keep");

    syncConsentedFirstTouchUtm({
      enabled: true,
      consent: "revoked",
      pathname: "/onboarding/owner",
      search: "?utm_source=private",
      storage,
    });

    expect(storage.getItem(UTM_STORAGE_KEY)).toBe(null);
    expect(storage.getItem(CONSENTED_UTM_STORAGE_KEY)).toBe(null);
    expect(storage.getItem("zaltyko:owner-onboarding-draft:v1")).toBe("draft");
    expect(storage.getItem("another-session-key")).toBe("keep");
    clearFirstTouchUtm(storage);
    expect(storage.getItem("zaltyko:owner-onboarding-draft:v1")).toBe("draft");
  });
});

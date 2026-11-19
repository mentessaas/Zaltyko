import { describe, expect, it } from "vitest";

import {
  getSafePublicTrackingPath,
  getSafePublicTrackingPathFromUrl,
  isOptionalTrackingAllowed,
  sanitizePostHogAppProperties,
  sanitizePostHogEvent,
  sanitizePostHogProperties,
  sanitizeSpeedInsightsEvent,
  sanitizeVercelAnalyticsEvent,
} from "@/lib/optional-tracking-policy";

describe("optional tracking policy", () => {
  it("requires an explicit provider flag, consent, and an exact public route", () => {
    expect(isOptionalTrackingAllowed(true, true, "/pricing")).toBe(true);
    expect(isOptionalTrackingAllowed(false, true, "/pricing")).toBe(false);
    expect(isOptionalTrackingAllowed(true, false, "/pricing")).toBe(false);

    for (const pathname of [
      "/auth/register",
      "/owner/attendance",
      "/dashboard",
      "/app/academy-id",
      "/invite/athlete",
      "/coaches/coach-slug",
      "/pricing/plan-id",
      "/pricing/private?email=family@example.test",
    ]) {
      expect(isOptionalTrackingAllowed(true, true, pathname)).toBe(false);
    }
  });

  it("accepts only same-origin static public paths and drops query/hash", () => {
    expect(getSafePublicTrackingPath("/pricing/?utm_source=private#hero")).toBe(
      "/pricing"
    );
    expect(getSafePublicTrackingPath("https://attacker.invalid/pricing")).toBe(
      null
    );
    expect(
      getSafePublicTrackingPathFromUrl(
        "https://zaltyko.test/pricing?email=family@example.test#faq",
        "https://zaltyko.test"
      )
    ).toBe("/pricing");
    expect(
      getSafePublicTrackingPathFromUrl(
        "https://attacker.invalid/pricing",
        "https://zaltyko.test"
      )
    ).toBe(null);
  });

  it("keeps only bounded public PostHog properties and replaces location data", () => {
    expect(
      sanitizePostHogProperties(
        {
          "$initial_current_url": "https://zaltyko.test/owner?token=secret",
          "$initial_pathname": "/owner",
          "$lib": "web",
          "$lib_version": "1.0.0",
          "$session_id": "synthetic-session",
          "$referrer": "https://private.invalid/profile?email=private",
          "$current_url": "https://zaltyko.test/pricing?email=private",
          "$pathname": "/owner/attendance",
          distinct_id: "synthetic-anonymous-id",
          token: "phc_public_project_key",
          user_id: "user-secret",
          academy_id: "academy-secret",
          tenant_id: "tenant-secret",
          arbitrary: { private: true },
          source: "landing_page",
          plan: "starter",
        },
        "/pricing",
        "https://zaltyko.test"
      )
    ).toEqual({
      "$current_url": "https://zaltyko.test/pricing",
      "$pathname": "/pricing",
      "$initial_current_url": "https://zaltyko.test/pricing",
      "$initial_pathname": "/pricing",
      "$lib": "web",
      "$lib_version": "1.0.0",
      "$session_id": "synthetic-session",
      distinct_id: "synthetic-anonymous-id",
      token: "phc_public_project_key",
      source: "landing_page",
      plan: "starter",
    });

    expect(
      sanitizePostHogProperties({ source: "user entered text" }, "/pricing", "https://zaltyko.test")
    ).toEqual({
      "$current_url": "https://zaltyko.test/pricing",
      "$pathname": "/pricing",
    });
  });

  it("does not let app event metadata override SDK identity or carry arbitrary fields", () => {
    expect(
      sanitizePostHogAppProperties(
        "lead_captured",
        {
          source: "landing_page",
          plan: "starter",
          token: "app-secret",
          distinct_id: "user@example.test",
          user_id: "private-user",
          academy_id: "private-academy",
        },
        "/pricing",
        "https://zaltyko.test"
      )
    ).toEqual({
      "$current_url": "https://zaltyko.test/pricing",
      "$pathname": "/pricing",
      source: "landing_page",
      plan: "starter",
    });
  });

  it("drops unapproved events and rejects private routes at send time", () => {
    expect(
      sanitizePostHogEvent(
        {
          event: "owner_profile_viewed",
          properties: { user_id: "private-user" },
        },
        {
          enabled: true,
          consentGranted: true,
          pathname: "/pricing",
          origin: "https://zaltyko.test",
        }
      )
    ).toBe(null);

    expect(
      sanitizePostHogEvent(
        { event: "$pageview", properties: { path: "/pricing?email=x" } },
        {
          enabled: true,
          consentGranted: true,
          pathname: "/owner/attendance",
          origin: "https://zaltyko.test",
        }
      )
    ).toBe(null);

    expect(
      sanitizePostHogEvent(
        {
          event: "lead_captured",
          properties: {
            source: "landing_page",
            email: "family@example.test",
            user_id: "private-user",
          },
        },
        {
          enabled: true,
          consentGranted: true,
          pathname: "/pricing",
          origin: "https://zaltyko.test",
        }
      )
    ).toMatchObject({
      event: "lead_captured",
      properties: {
        "$current_url": "https://zaltyko.test/pricing",
        "$pathname": "/pricing",
        source: "landing_page",
      },
    });
  });

  it("forces person processing off after sanitizing caller properties", () => {
    const event = sanitizePostHogEvent(
      {
        event: "$pageview",
        properties: {
          $process_person_profile: true,
          email: "family@example.test",
        },
      },
      {
        enabled: true,
        consentGranted: true,
        pathname: "/pricing",
        origin: "https://zaltyko.test",
      }
    );

    expect(event).toMatchObject({
      event: "$pageview",
      properties: {
        $process_person_profile: false,
        "$current_url": "https://zaltyko.test/pricing",
        "$pathname": "/pricing",
      },
    });
    expect(event?.properties).not.toHaveProperty("email");
  });

  it("keeps only Vercel pageviews and preserves each SDK event contract", () => {
    const options = {
      enabled: true,
      consentGranted: true,
      pathname: "/pricing",
      origin: "https://zaltyko.test",
    };
    const safeAnalytics = sanitizeVercelAnalyticsEvent(
      {
        type: "pageview",
        url: "https://zaltyko.test/pricing?email=family@example.test",
      },
      options
    );

    expect(safeAnalytics).toEqual({
      type: "pageview",
      url: "https://zaltyko.test/pricing",
    });
    expect(
      sanitizeVercelAnalyticsEvent(
        { type: "event", url: "https://zaltyko.test/pricing" },
        options
      )
    ).toBe(null);

    expect(
      sanitizeSpeedInsightsEvent(
        {
          type: "vital",
          url: "https://zaltyko.test/pricing?email=family@example.test",
          route: "/pricing?email=family@example.test",
        },
        options
      )
    ).toEqual({
      type: "vital",
      url: "https://zaltyko.test/pricing",
      route: "/pricing",
    });

    expect(
      sanitizeSpeedInsightsEvent(
        {
          type: "vital",
          url: "https://zaltyko.test/owner?token=private",
        },
        { ...options, pathname: "/owner" }
      )
    ).toBe(null);
  });
});

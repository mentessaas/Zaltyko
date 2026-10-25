import type { BrowserContext, Route } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";

import {
  classifyLocalE2ERequest,
  grantLocalNetworkAccess,
  HIBP_FIXTURE_BODY,
  installLocalE2ENetworkGuard,
  isExpectedBlockedTelemetryRequest,
  shouldGrantLocalNetworkAccess,
  stripExternalResourceHints,
  validateHibpFixtureResponse,
} from "./support/local-e2e-network";

function fakeRoute(input: {
  url: string;
  method?: string;
  resourceType?: string;
  headers?: Record<string, string>;
}) {
  const route = {
    request: () => ({
      url: () => input.url,
      method: () => input.method ?? "GET",
      resourceType: () => input.resourceType ?? "image",
      allHeaders: async () => input.headers ?? {},
    }),
    fetch: vi.fn(),
    continue: vi.fn().mockResolvedValue(undefined),
    fulfill: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn().mockResolvedValue(undefined),
  };
  return route as unknown as Route;
}

function fakeContext() {
  let handler: ((route: Route) => Promise<void>) | undefined;
  const context = {
    route: vi.fn(async (_pattern: string, registered: unknown) => {
      handler = registered as (route: Route) => Promise<void>;
    }),
    grantPermissions: vi.fn().mockResolvedValue(undefined),
  };
  return {
    context: context as unknown as BrowserContext,
    handler: () => {
      if (!handler) throw new Error("Network guard route was not installed.");
      return handler;
    },
  };
}

describe("local browser network guard", () => {
  it("fulfills only a valid HIBP range request from the explicit local fixture", async () => {
    const { context, handler } = fakeContext();
    const violations = await installLocalE2ENetworkGuard(context, {
      baseUrl: "http://127.0.0.1:43123",
      supabaseUrl: "http://127.0.0.1:54321",
    });
    const route = fakeRoute({
      url: "https://api.pwnedpasswords.com/range/ABCDE",
      headers: { accept: "text/plain", "add-padding": "true" },
    });

    await handler()(route);

    expect(route.fulfill).toHaveBeenCalledWith({
      status: 200,
      contentType: "text/plain; charset=utf-8",
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      },
      body: HIBP_FIXTURE_BODY,
    });
    expect(violations().unexpectedBlockedRequests).toEqual([]);
    expect(() => validateHibpFixtureResponse(HIBP_FIXTURE_BODY)).not.toThrow();
  });

  it("allows exact loopback app assets and blocks unapproved network requests", async () => {
    const { context, handler } = fakeContext();
    const violations = await installLocalE2ENetworkGuard(context, {
      baseUrl: "http://127.0.0.1:43123",
      supabaseUrl: "http://127.0.0.1:54321",
    });
    const localRoute = fakeRoute({
      url: "http://127.0.0.1:43123/_next/static/chunk.js",
    });
    const externalRoute = fakeRoute({
      url: "https://example.invalid/font.woff2",
    });
    const wrongPortRoute = fakeRoute({
      url: "http://127.0.0.1:43124/asset.js",
    });

    await handler()(localRoute);
    await handler()(externalRoute);
    await handler()(wrongPortRoute);

    expect(localRoute.continue).toHaveBeenCalledOnce();
    expect(externalRoute.abort).toHaveBeenCalledWith("blockedbyclient");
    expect(wrongPortRoute.abort).toHaveBeenCalledWith("blockedbyclient");
    expect(violations().unexpectedBlockedRequests).toEqual([
      "https://example.invalid",
      "http://127.0.0.1:43124",
    ]);
  });

  it("rejects malformed HIBP paths and non-loopback test origins", async () => {
    const decision = classifyLocalE2ERequest(
      {
        url: "https://api.pwnedpasswords.com/range/not-a-prefix",
        method: "GET",
        headers: { accept: "text/plain", "add-padding": "true" },
      },
      new Set(["http://127.0.0.1:43123"])
    );
    expect(decision).toEqual({
      kind: "block",
      label: "invalid HIBP request",
    });

    const { context } = fakeContext();
    await expect(
      installLocalE2ENetworkGuard(context, {
        baseUrl: "https://example.com",
        supabaseUrl: "http://127.0.0.1:54321",
      })
    ).rejects.toThrow("credential-free loopback URL");
  });

  it("rejects malformed local HIBP fixture bodies", () => {
    expect(() => validateHibpFixtureResponse("malformed response")).toThrow(
      "valid zero-count range row"
    );
  });

  it("grants local network access only to the validated app loopback origin", async () => {
    const { context } = fakeContext();

    await grantLocalNetworkAccess(
      context,
      "http://127.0.0.1:43123/register?role=owner"
    );

    expect(context.grantPermissions).toHaveBeenCalledOnce();
    expect(context.grantPermissions).toHaveBeenCalledWith(
      ["local-network-access"],
      { origin: "http://127.0.0.1:43123" }
    );
  });

  it("refuses the local network permission for non-loopback origins", async () => {
    const { context } = fakeContext();

    await expect(
      grantLocalNetworkAccess(context, "https://example.com")
    ).rejects.toThrow("credential-free loopback URL");

    expect(context.grantPermissions).not.toHaveBeenCalled();
  });

  it.each([
    [true, "chromium", true],
    [true, "firefox", false],
    [true, "webkit", false],
    [false, "chromium", false],
  ])(
    "scopes local-network grants to local Chromium runs (%s, %s)",
    (isLocalSupabaseRun, projectName, expected) => {
      expect(
        shouldGrantLocalNetworkAccess(isLocalSupabaseRun, projectName)
      ).toBe(expected);
    }
  );

  it("classifies only the Sentry browser CDN as expected blocked telemetry", () => {
    expect(
      isExpectedBlockedTelemetryRequest({
        url: "https://browser.sentry-cdn.com/10.76.2/replay.min.js",
        method: "GET",
        resourceType: "script",
      })
    ).toBe(true);
    expect(
      isExpectedBlockedTelemetryRequest({
        url: "https://browser.sentry-cdn.com/10.76.2/envelope/",
        method: "POST",
        resourceType: "fetch",
      })
    ).toBe(true);
    expect(
      isExpectedBlockedTelemetryRequest({
        url: "https://browser.sentry-cdn.com/10.76.2/envelope/?sentry_key=synthetic",
        method: "POST",
        resourceType: "fetch",
      })
    ).toBe(true);
    expect(
      isExpectedBlockedTelemetryRequest({
        url: "https://browser.sentry-cdn.com.evil.invalid/10.77.0/replay.min.js",
        method: "GET",
        resourceType: "script",
      })
    ).toBe(false);
    expect(
      isExpectedBlockedTelemetryRequest({
        url: "not a URL",
        method: "GET",
        resourceType: "script",
      })
    ).toBe(false);
  });

  it("continues blocking Sentry CDN requests and records them separately", async () => {
    const { context, handler } = fakeContext();
    const networkReport = await installLocalE2ENetworkGuard(context, {
      baseUrl: "http://127.0.0.1:43123",
      supabaseUrl: "http://127.0.0.1:54321",
    });
    const route = fakeRoute({
      url: "https://browser.sentry-cdn.com/10.76.2/replay.min.js",
      resourceType: "script",
    });
    const envelopeRoute = fakeRoute({
      url: "https://browser.sentry-cdn.com/10.76.2/envelope/?sentry_key=synthetic",
      method: "POST",
      resourceType: "fetch",
    });

    await handler()(route);
    await handler()(envelopeRoute);

    expect(route.abort).toHaveBeenCalledWith("blockedbyclient");
    expect(envelopeRoute.abort).toHaveBeenCalledWith("blockedbyclient");
    expect(route.continue).not.toHaveBeenCalled();
    expect(envelopeRoute.continue).not.toHaveBeenCalled();
    expect(networkReport()).toEqual({
      unexpectedBlockedRequests: [],
      expectedBlockedTelemetryRequests: [
        "https://browser.sentry-cdn.com/10.76.2/replay.min.js",
        "https://browser.sentry-cdn.com/10.76.2/envelope/",
      ],
    });
  });

  it("strips external resource hints while preserving allowed local hints", () => {
    const html = `<html><head>
      <link rel="preconnect" href="https://js.stripe.com">
      <link href="https://api.stripe.com" rel="preconnect">
      <link rel="dns-prefetch" href="//example.invalid">
      <link rel="preconnect" href="http://127.0.0.1:54321">
      <link rel="stylesheet" href="https://example.invalid/app.css">
    </head></html>`;

    const result = stripExternalResourceHints(
      html,
      new Set(["http://127.0.0.1:54321"])
    );

    expect(result).not.toContain("https://js.stripe.com");
    expect(result).not.toContain("https://api.stripe.com");
    expect(result).not.toContain('rel="dns-prefetch"');
    expect(result).toContain('href="http://127.0.0.1:54321"');
    expect(result).toContain('rel="stylesheet"');
  });

  it("rewrites only local HTML documents before browser delivery", async () => {
    const { context, handler } = fakeContext();
    await installLocalE2ENetworkGuard(context, {
      baseUrl: "http://127.0.0.1:43123",
      supabaseUrl: "http://127.0.0.1:54321",
    });
    const route = fakeRoute({
      url: "http://127.0.0.1:43123/owner",
      resourceType: "document",
    });
    route.fetch.mockResolvedValue({
      headers: () => ({
        "content-type": "text/html; charset=utf-8",
        "content-length": "100",
        "content-encoding": "gzip",
      }),
      text: async () =>
        '<html><link rel="preconnect" href="https://js.stripe.com"></html>',
    });

    await handler()(route);

    expect(route.fetch).toHaveBeenCalledOnce();
    expect(route.fulfill).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { "content-type": "text/html; charset=utf-8" },
        body: "<html></html>",
      })
    );
    expect(route.continue).not.toHaveBeenCalled();
  });
});

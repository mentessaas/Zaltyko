import type { BrowserContext, Route } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";

import {
  classifyLocalE2ERequest,
  HIBP_FIXTURE_BODY,
  installLocalE2ENetworkGuard,
  validateHibpFixtureResponse,
} from "./support/local-e2e-network";

function fakeRoute(input: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
}) {
  const route = {
    request: () => ({
      url: () => input.url,
      method: () => input.method ?? "GET",
      allHeaders: async () => input.headers ?? {},
    }),
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
    expect(violations()).toEqual([]);
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
    expect(violations()).toEqual([
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
});

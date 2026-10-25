import type { BrowserContext, Route } from "@playwright/test";

export const HIBP_FIXTURE_BODY = `${"0".repeat(35)}:0\r\n`;
const EXPECTED_SENTRY_BROWSER_ORIGIN = "https://browser.sentry-cdn.com";

type RequestInput = {
  url: string;
  method: string;
  headers: Record<string, string>;
};

export type LocalNetworkDecision =
  | { kind: "allow" }
  | { kind: "hibp-fixture"; body: string }
  | { kind: "block"; label: string };

function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}

export function validateHibpFixtureResponse(body: string): void {
  if (!/^[A-F0-9]{35}:0\r?\n$/.test(body)) {
    throw new Error(
      "The local HIBP fixture must be one valid zero-count range row."
    );
  }
}

/** Remove only external DNS/preconnect hints from a locally-served HTML document. */
export function stripExternalResourceHints(
  html: string,
  allowedOrigins: ReadonlySet<string>
): string {
  return html.replace(/<link\b[^>]*>/gi, (tag) => {
    const rel = tag
      .match(/\brel\s*=\s*(["'])(.*?)\1/i)?.[2]
      ?.toLowerCase()
      .split(/\s+/);
    if (
      !rel?.some((value) => value === "preconnect" || value === "dns-prefetch")
    ) {
      return tag;
    }
    const href = tag.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (!href) return tag;
    try {
      return allowedOrigins.has(new URL(href, "http://local.invalid").origin)
        ? tag
        : "";
    } catch {
      return tag;
    }
  });
}

export function classifyLocalE2ERequest(
  request: RequestInput,
  allowedOrigins: ReadonlySet<string>
): LocalNetworkDecision {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return { kind: "block", label: "invalid URL" };
  }

  if (
    url.protocol === "data:" ||
    url.protocol === "blob:" ||
    url.protocol === "about:"
  ) {
    return { kind: "allow" };
  }

  if (url.protocol === "https:" && url.hostname === "api.pwnedpasswords.com") {
    const validRequest =
      request.method === "GET" &&
      /^\/range\/[A-F0-9]{5}$/i.test(url.pathname) &&
      url.search === "" &&
      request.headers["add-padding"]?.toLowerCase() === "true" &&
      request.headers.accept?.toLowerCase().includes("text/plain");
    if (!validRequest) return { kind: "block", label: "invalid HIBP request" };
    validateHibpFixtureResponse(HIBP_FIXTURE_BODY);
    return { kind: "hibp-fixture", body: HIBP_FIXTURE_BODY };
  }

  if (
    (url.protocol === "http:" || url.protocol === "https:") &&
    isLoopback(url.hostname) &&
    allowedOrigins.has(url.origin)
  ) {
    return { kind: "allow" };
  }

  return { kind: "block", label: `${url.protocol}//${url.host}` };
}

export function isExpectedBlockedTelemetryRequest(input: {
  url: string;
  method: string;
  resourceType: string;
}): boolean {
  try {
    const url = new URL(input.url);
    // Sentry's browser CDN traffic is telemetry in local E2E; the guard still aborts it.
    return url.origin === EXPECTED_SENTRY_BROWSER_ORIGIN;
  } catch {
    return false;
  }
}

function localOrigin(value: string, label: string): string {
  const url = new URL(value);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !isLoopback(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new Error(`${label} must be a credential-free loopback URL.`);
  }
  return url.origin;
}

/** Grant Chromium local-network access only to the validated app loopback origin. */
export async function grantLocalNetworkAccess(
  context: BrowserContext,
  baseUrl: string
): Promise<void> {
  await context.grantPermissions(["local-network-access"], {
    origin: localOrigin(baseUrl, "Browser base URL"),
  });
}

export function shouldGrantLocalNetworkAccess(
  isLocalSupabaseRun: boolean,
  projectName: string
): boolean {
  return isLocalSupabaseRun && projectName === "chromium";
}

export type LocalNetworkGuardReport = {
  unexpectedBlockedRequests: string[];
  expectedBlockedTelemetryRequests: string[];
};

export async function installLocalE2ENetworkGuard(
  context: BrowserContext,
  input: { baseUrl: string; supabaseUrl: string }
): Promise<() => LocalNetworkGuardReport> {
  const allowedOrigins = new Set([
    localOrigin(input.baseUrl, "Browser base URL"),
    localOrigin(input.supabaseUrl, "Local Supabase URL"),
  ]);
  const unexpectedBlockedRequests: string[] = [];
  const expectedBlockedTelemetryRequests: string[] = [];

  await context.route("**/*", async (route: Route) => {
    const request = route.request();
    const decision = classifyLocalE2ERequest(
      {
        url: request.url(),
        method: request.method(),
        headers: await request.allHeaders(),
      },
      allowedOrigins
    );
    if (decision.kind === "allow") {
      const requestUrl = new URL(request.url());
      const appOrigin = localOrigin(input.baseUrl, "Browser base URL");
      if (
        request.method() === "GET" &&
        request.resourceType() === "document" &&
        requestUrl.origin === appOrigin
      ) {
        const response = await route.fetch();
        const contentType = response.headers()["content-type"] ?? "";
        if (contentType.toLowerCase().includes("text/html")) {
          const headers = { ...response.headers() };
          delete headers["content-length"];
          delete headers["content-encoding"];
          delete headers["transfer-encoding"];
          await route.fulfill({
            response,
            headers,
            body: stripExternalResourceHints(
              await response.text(),
              allowedOrigins
            ),
          });
          return;
        }
      }
      await route.continue();
      return;
    }
    if (decision.kind === "hibp-fixture") {
      await route.fulfill({
        status: 200,
        contentType: "text/plain; charset=utf-8",
        headers: {
          "access-control-allow-origin": "*",
          "cache-control": "no-store",
        },
        body: decision.body,
      });
      return;
    }
    if (
      isExpectedBlockedTelemetryRequest({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
      })
    ) {
      const { origin, pathname } = new URL(request.url());
      expectedBlockedTelemetryRequests.push(`${origin}${pathname}`);
    } else {
      unexpectedBlockedRequests.push(decision.label);
    }
    await route.abort("blockedbyclient");
  });

  return () => ({
    unexpectedBlockedRequests: [...unexpectedBlockedRequests],
    expectedBlockedTelemetryRequests: [...expectedBlockedTelemetryRequests],
  });
}

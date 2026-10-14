import type { BrowserContext, Route } from "@playwright/test";

export const HIBP_FIXTURE_BODY = `${"0".repeat(35)}:0\r\n`;

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

export async function installLocalE2ENetworkGuard(
  context: BrowserContext,
  input: { baseUrl: string; supabaseUrl: string }
): Promise<() => string[]> {
  const allowedOrigins = new Set([
    localOrigin(input.baseUrl, "Browser base URL"),
    localOrigin(input.supabaseUrl, "Local Supabase URL"),
  ]);
  const blockedRequests: string[] = [];

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
    blockedRequests.push(decision.label);
    await route.abort("blockedbyclient");
  });

  return () => [...blockedRequests];
}

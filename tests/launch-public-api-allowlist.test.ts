import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { classifyRouteAuth } from "../scripts/lib/route-auth-classifier";
import { isRetiredLaunchApi, RETIRED_LAUNCH_API_PREFIXES } from "@/lib/launch/essential-routes";

/**
 * Every API a visitor can call without a session during the launch, with the
 * reason it is open. A new public handler, or one whose guard the classifier
 * cannot recognise, fails here until it is either listed with a reason or
 * closed by the launch cut (RETIRED_LAUNCH_API_PREFIXES, answered 410).
 */
const PUBLIC_API_ALLOWLIST: Record<string, string> = {
  "GET /api/health": "Uptime monitor; no personal data.",
  "GET /api/plans": "Public pricing shown on the website.",
  "POST /api/leads": "Website email capture, rate limited.",
  "POST /api/growth/events": "First-party measurement behind consent, rate limited.",
  "GET /api/preferences": "Email preferences behind a signed link token.",
  "POST /api/preferences": "Email preferences behind a signed link token.",
  "GET /api/unsubscribe": "One-click unsubscribe behind a signed link token.",
  "POST /api/unsubscribe": "One-click unsubscribe behind a signed link token.",
  "GET /api/athletes/invite/state/[stateToken]": "Opaque invitation token is the authorization.",
  "GET /api/public/academies/filter-options": "Read-only filter values, no personal data.",
  "GET /api/public/events/filter-options": "Read-only filter values, no personal data.",
};

const OPEN_CLASSES = new Set(["public", "unknown"]);
const HTTP_METHODS = /^(GET|POST|PUT|PATCH|DELETE)$/;
const apiRoot = join(process.cwd(), "src", "app", "api");

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

function exportedMethods(source: string): string[] {
  const declared = [...source.matchAll(/export\s+(?:async\s+function|const|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)]
    .map(match => match[1]);
  const reexported = [...source.matchAll(/export\s*\{([^}]*)\}/g)]
    .flatMap(match => match[1].split(","))
    .map(part => part.trim().split(/\s+as\s+/).pop() ?? "")
    .filter(name => HTTP_METHODS.test(name));
  return [...new Set([...declared, ...reexported])];
}

function openApiHandlers(): string[] {
  return routeFiles(apiRoot).flatMap(file => {
    const source = readFileSync(file, "utf8");
    const repoPath = relative(process.cwd(), file).split(sep).join("/");
    const route = `/${relative(join(process.cwd(), "src", "app"), file).split(sep).slice(0, -1).join("/")}`;
    return exportedMethods(source)
      .filter(method => OPEN_CLASSES.has(classifyRouteAuth(repoPath, source, method)))
      .map(method => `${method} ${route}`);
  });
}

describe("launch public API allowlist", () => {
  const open = openApiHandlers();

  it("finds the API handlers it audits", () => {
    expect(open.length).toBeGreaterThan(0);
  });

  it("only leaves open the listed public APIs; the rest are retired by the launch cut", () => {
    const unexpected = open.filter(handler => {
      const route = handler.slice(handler.indexOf(" ") + 1);
      return !(handler in PUBLIC_API_ALLOWLIST) && !isRetiredLaunchApi(route);
    });
    expect(unexpected).toEqual([]);
  });

  it("keeps the allowlist current: every entry is still an open handler and none is retired", () => {
    for (const handler of Object.keys(PUBLIC_API_ALLOWLIST)) {
      expect(open, handler).toContain(handler);
      expect(isRetiredLaunchApi(handler.slice(handler.indexOf(" ") + 1)), handler).toBe(false);
    }
  });

  it("retires the public Stripe Connect checkout and the historical store", () => {
    for (const route of ["/api/checkout", "/api/products", "/api/academy/stripe-connect/onboard", "/api/marketplace"]) {
      expect(isRetiredLaunchApi(route), route).toBe(true);
    }
    for (const prefix of RETIRED_LAUNCH_API_PREFIXES) {
      expect(prefix.startsWith("/api/"), prefix).toBe(true);
    }
  });
});

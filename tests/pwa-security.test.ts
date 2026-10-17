import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function workerHarness() {
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const put = vi.fn();
  const addAll = vi.fn().mockResolvedValue(undefined);
  const offline = new Response("Offline", { status: 503 });
  const caches = {
    open: vi.fn().mockResolvedValue({ put, addAll }),
    match: vi.fn().mockResolvedValue(offline),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
  };
  const fetch = vi.fn().mockResolvedValue(new Response("Synthetic response"));
  const skipWaiting = vi.fn();
  const self = {
    location: { origin: "https://synthetic.test" },
    addEventListener: (
      name: string,
      handler: (event: Record<string, unknown>) => void
    ) => handlers.set(name, handler),
    skipWaiting,
    clients: { claim: vi.fn() },
  };
  runInNewContext(
    readFileSync(
      fileURLToPath(new URL("../public/sw.js", import.meta.url)),
      "utf8"
    ),
    { self, caches, fetch, URL, Response }
  );
  return { handlers, caches, fetch, put, addAll, offline, skipWaiting };
}

function workerRequest(
  path: string,
  method = "GET",
  mode = "cors",
  headers: HeadersInit = {}
) {
  return {
    url: `https://synthetic.test${path}`,
    method,
    mode,
    headers: new Headers(headers),
  };
}

describe("PWA security contracts", () => {
  it("does not contact analytics origins through unconditional layout hints", () => {
    const layout = readFileSync(
      fileURLToPath(new URL("../src/app/layout.tsx", import.meta.url)),
      "utf8"
    );
    expect(layout).not.toMatch(/<link[^>]+href=["'][^"']*posthog/i);
  });

  it("does not skip waiting during installation; activation is explicit", async () => {
    const worker = workerHarness();
    let installation: Promise<unknown> | undefined;
    worker.handlers.get("install")!({
      waitUntil: (work: Promise<unknown>) => {
        installation = work;
      },
    });
    await installation;
    expect(worker.addAll).toHaveBeenCalledOnce();
    expect(worker.skipWaiting).not.toHaveBeenCalled();
    worker.handlers.get("message")!({ data: { type: "SKIP_WAITING" } });
    expect(worker.skipWaiting).toHaveBeenCalledOnce();
  });

  it.each([
    "/api/v1/owner/billing/monthly-invoices/options",
    "/api/private-image.png",
  ])(
    "fetches API response without consulting or writing cache: %s",
    async (path) => {
      const worker = workerHarness();
      const request = workerRequest(path);
      let response: Promise<Response> | undefined;
      worker.handlers.get("fetch")!({
        request,
        respondWith: (work: Promise<Response>) => {
          response = work;
        },
      });
      await response;
      expect(worker.fetch).toHaveBeenCalledWith(request);
      expect(worker.caches.match).not.toHaveBeenCalled();
      expect(worker.caches.open).not.toHaveBeenCalled();
      expect(worker.put).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["RSC header", "/owner/enrollments?organizationId=synthetic", { RSC: "1" }],
    ["RSC query", "/owner/enrollments?_rsc=synthetic", {}],
  ])("leaves Next RSC requests to the browser: %s", (_label, path, headers) => {
    const worker = workerHarness();
    const request = workerRequest(path, "GET", "cors", headers);
    const respondWith = vi.fn();

    worker.handlers.get("fetch")!({ request, respondWith });

    expect(respondWith).not.toHaveBeenCalled();
    expect(worker.fetch).not.toHaveBeenCalled();
    expect(worker.caches.match).not.toHaveBeenCalled();
    expect(worker.caches.open).not.toHaveBeenCalled();
  });

  it("continues network pass-through for ordinary dynamic GET requests", async () => {
    const worker = workerHarness();
    const request = workerRequest(
      "/owner/enrollments?status=pending&organizationId=synthetic"
    );
    let response: Promise<Response> | undefined;

    worker.handlers.get("fetch")!({
      request,
      respondWith: (work: Promise<Response>) => {
        response = work;
      },
    });

    await response;
    expect(worker.fetch).toHaveBeenCalledWith(request);
    expect(worker.caches.match).not.toHaveBeenCalled();
    expect(worker.caches.open).not.toHaveBeenCalled();
  });

  it("continues cache-first handling for safe static assets", async () => {
    const worker = workerHarness();
    worker.caches.match.mockResolvedValueOnce(undefined);
    const request = workerRequest("/_next/static/chunks/app.js");
    const cachedResponse = { body: "static" };
    const networkResponse = {
      ok: true,
      type: "basic",
      clone: vi.fn(() => cachedResponse),
    };
    worker.fetch.mockResolvedValueOnce(networkResponse as unknown as Response);
    let response: Promise<Response> | undefined;

    worker.handlers.get("fetch")!({
      request,
      respondWith: (work: Promise<Response>) => {
        response = work;
      },
    });

    await expect(response).resolves.toBe(networkResponse);
    expect(worker.caches.match).toHaveBeenCalledWith(request);
    expect(worker.fetch).toHaveBeenCalledWith(request);
    expect(worker.put).toHaveBeenCalledWith(request, cachedResponse);
  });

  it("never caches private navigation and returns only static offline content on network failure", async () => {
    const worker = workerHarness();
    const request = workerRequest(
      "/owner?organizationId=synthetic",
      "GET",
      "navigate"
    );
    let response: Promise<Response> | undefined;
    const event = {
      request,
      respondWith: (work: Promise<Response>) => {
        response = work;
      },
    };
    worker.handlers.get("fetch")!(event);
    await response;
    expect(worker.put).not.toHaveBeenCalled();
    expect(worker.caches.match).not.toHaveBeenCalled();
    worker.fetch.mockRejectedValueOnce(new Error("Offline"));
    worker.handlers.get("fetch")!(event);
    expect(await response).toBe(worker.offline);
    expect(worker.caches.match).toHaveBeenCalledWith("/offline.html");
    expect(worker.put).not.toHaveBeenCalled();
  });

  it("does not intercept or replay financial POST requests", () => {
    const worker = workerHarness();
    const respondWith = vi.fn();
    worker.handlers.get("fetch")!({
      request: workerRequest("/api/v1/owner/billing/manual-payments", "POST"),
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
    expect(worker.fetch).not.toHaveBeenCalled();
    expect(worker.caches.open).not.toHaveBeenCalled();
  });

  it("never caches API responses or replays background mutations", () => {
    const swPath = fileURLToPath(new URL("../public/sw.js", import.meta.url));
    const source = readFileSync(swPath, "utf8");

    expect(source).not.toContain("API_CACHE");
    expect(source).not.toContain("pendingOperations");
    expect(source).not.toContain("addEventListener('sync'");
    expect(source).toMatch(/url\.pathname\.startsWith\(["']\/api\/["']\)/);
    expect(source).toContain("event.respondWith(fetch(request))");
  });

  it("keeps the application-level offline mutation queue disabled", () => {
    const queuePath = fileURLToPath(
      new URL("../src/lib/offline/operations-queue.ts", import.meta.url)
    );
    const source = readFileSync(queuePath, "utf8");

    expect(source).toContain("OFFLINE_MUTATIONS_ENABLED = false");
    expect(source).toContain("Offline mutations are disabled");
  });

  it("does not advertise legacy shortcuts or a missing share endpoint", () => {
    const manifestPath = fileURLToPath(
      new URL("../public/manifest.json", import.meta.url)
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    expect(manifest.shortcuts).toEqual([]);
    expect(manifest.share_target).toBeUndefined();
  });
});

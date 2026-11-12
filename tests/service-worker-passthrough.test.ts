import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

// Producción mostraba "The FetchEvent for https://zaltyko.com/app/<id>/athletes
// resulted in a network error response: the promise was rejected" y
// "sw.js:67 Uncaught (in promise) TypeError: Failed to fetch": el worker
// envolvía en respondWith(fetch(request)) peticiones que no necesitaba tocar.

const swSource = readFileSync(
  fileURLToPath(new URL("../public/sw.js", import.meta.url)),
  "utf8",
);

function loadWorker() {
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const put = vi.fn().mockResolvedValue(undefined);
  const offline = new Response("Offline", { status: 503 });
  const caches = {
    open: vi.fn().mockResolvedValue({ put, addAll: vi.fn().mockResolvedValue(undefined) }),
    match: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
  };
  const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  const self = {
    location: { origin: "https://synthetic.test" },
    addEventListener: (name: string, handler: (event: Record<string, unknown>) => void) =>
      handlers.set(name, handler),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  };
  runInNewContext(swSource, { self, caches, fetch, URL, Response });
  return { handlers, caches, fetch, put, offline };
}

function request(path: string, mode = "cors", headers: HeadersInit = { accept: "*/*" }) {
  return {
    url: `https://synthetic.test${path}`,
    method: "GET",
    mode,
    headers: new Headers(headers),
  };
}

describe("service worker pass-through", () => {
  it("no envuelve peticiones a /api/ ni GET dinámicos en respondWith(fetch(request))", () => {
    expect(swSource).not.toContain("respondWith(fetch(request))");
    expect(swSource).toMatch(/startsWith\('\/api\/'\)\) \{\s*return;\s*\}/);
  });

  it.each([
    "/api/x",
    "/api/athletes/import",
    "/app/00000000-0000-4000-8000-000000000000/athletes",
  ])("deja %s al navegador: no llama a respondWith ni a fetch", (path) => {
    const worker = loadWorker();
    const respondWith = vi.fn();

    worker.handlers.get("fetch")!({ request: request(path), respondWith });

    expect(respondWith).not.toHaveBeenCalled();
    expect(worker.fetch).not.toHaveBeenCalled();
    expect(worker.caches.match).not.toHaveBeenCalled();
  });

  it("mantiene el fallback offline en navegaciones sin rechazar la promesa", async () => {
    const worker = loadWorker();
    worker.caches.match.mockResolvedValueOnce(worker.offline);
    let response: Promise<Response> | undefined;

    worker.handlers.get("fetch")!({
      request: request("/app/00000000-0000-4000-8000-000000000000/athletes", "navigate", {
        accept: "text/html",
      }),
      respondWith: (work: Promise<Response>) => {
        response = work;
      },
    });

    await expect(response).resolves.toBe(worker.offline);
    expect(worker.caches.match).toHaveBeenCalledWith("/offline.html");
    expect(worker.put).not.toHaveBeenCalled();
  });

  it("un estático sin caché y sin red devuelve un error de red sin rechazo sin manejar", async () => {
    const worker = loadWorker();
    let response: Promise<Response> | undefined;

    worker.handlers.get("fetch")!({
      request: request("/_next/static/chunks/app.js"),
      respondWith: (work: Promise<Response>) => {
        response = work;
      },
    });

    const result = await response!;
    expect(result.type).toBe("error");
    expect(worker.fetch).toHaveBeenCalledOnce();
    expect(worker.put).not.toHaveBeenCalled();
  });

  it("sube la versión de caché para forzar la actualización del worker", () => {
    expect(swSource).toContain("const CACHE_NAME = 'zaltyko-static-v3';");
    const worker = loadWorker();
    const postMessage = vi.fn();
    worker.handlers.get("message")!({ data: { type: "GET_VERSION" }, ports: [{ postMessage }] });
    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage.mock.calls[0][0].version).toBe("zaltyko-static-v3");
  });
});

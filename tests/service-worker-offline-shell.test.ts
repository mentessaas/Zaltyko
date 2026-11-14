import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(fileURLToPath(new URL("../public/sw.js", import.meta.url)), "utf8");
const ORIGIN = "https://synthetic.test";

function load(cachedPaths: string[] = []) {
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const store = new Map<string, Response>();
  const put = vi.fn(async (req: string | { url: string }, res: Response) => {
    store.set(typeof req === "string" ? req : req.url.replace(ORIGIN, ""), res);
  });
  const offline = new Response("Offline", { status: 503 });
  const shell = new Response("shell");
  const cache = {
    put,
    addAll: vi.fn().mockResolvedValue(undefined),
    match: vi.fn(async (key: string) => store.get(key)),
  };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    match: vi.fn(async (key: string) => {
      if (key === "/offline.html") return offline;
      if (key === "/pasar-lista-sin-conexion" && cachedPaths.includes(key)) return shell;
      return undefined;
    }),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
  };
  const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (n: string, h: (e: Record<string, unknown>) => void) => handlers.set(n, h),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  };
  runInNewContext(source, { self, caches, fetch, URL, Response });
  return { handlers, caches, fetch, put, offline, shell, store };
}

function navigate(path: string) {
  return { url: `${ORIGIN}${path}`, method: "GET", mode: "navigate", headers: new Headers({ accept: "text/html" }) };
}

async function run(worker: ReturnType<typeof load>, path: string) {
  let response: Promise<Response> | undefined;
  worker.handlers.get("fetch")!({ request: navigate(path), respondWith: (w: Promise<Response>) => (response = w) });
  return response!;
}

describe("service worker: pasar lista sin conexión", () => {
  it("sin red en la lista de hoy redirige a la pantalla local si está guardada", async () => {
    const worker = load(["/pasar-lista-sin-conexion"]);
    const res = await run(worker, "/app/academia-1/attendance/today");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/pasar-lista-sin-conexion`);
  });

  it("conserva la sesión pedida en la redirección", async () => {
    const worker = load(["/pasar-lista-sin-conexion"]);
    const res = await run(worker, "/app/academia-1/attendance/today/sesion-9");
    expect(res.headers.get("location")).toBe(`${ORIGIN}/pasar-lista-sin-conexion?sesion=sesion-9`);
  });

  it("sin la pantalla guardada cae a la página sin conexión de siempre", async () => {
    const worker = load([]);
    expect(await run(worker, "/app/academia-1/attendance/today")).toBe(worker.offline);
  });

  it("sirve la pantalla guardada cuando se pide directamente sin red", async () => {
    const worker = load(["/pasar-lista-sin-conexion"]);
    expect(await run(worker, "/pasar-lista-sin-conexion?sesion=x")).toBe(worker.shell);
    expect(worker.caches.match).toHaveBeenCalledWith("/pasar-lista-sin-conexion", { ignoreSearch: true });
  });

  it("otras pantallas privadas no se redirigen ni se guardan", async () => {
    const worker = load(["/pasar-lista-sin-conexion"]);
    expect(await run(worker, "/app/academia-1/athletes")).toBe(worker.offline);
    expect(worker.put).not.toHaveBeenCalled();
  });

  it("CACHE_OFFLINE_SHELL guarda la pantalla y sus archivos, y nada más", async () => {
    const worker = load();
    const html =
      '<script src="/_next/static/chunks/main-app-1.js?dpl=x"></script><link href="/_next/static/css/app.css" rel="stylesheet">' +
      '<script>self.__next_f.push([1,"[\\"static/chunks/pagina.js\\"]"])</script>';
    const css = "@font-face{src:url(/_next/static/media/archivo.woff2)}";
    worker.fetch.mockImplementation(async (url: string) => {
      const body = url === "/pasar-lista-sin-conexion" ? html : url.endsWith(".css") ? css : "asset";
      const res = new Response(body, { status: 200 });
      Object.defineProperty(res, "type", { value: "basic" });
      return res;
    });
    let work: Promise<unknown> | undefined;
    worker.handlers.get("message")!({ data: { type: "CACHE_OFFLINE_SHELL" }, waitUntil: (w: Promise<unknown>) => (work = w) });
    await work;

    const cached = [...worker.store.keys()];
    expect(cached).toContain("/pasar-lista-sin-conexion");
    expect(cached).toContain("/_next/static/chunks/main-app-1.js?dpl=x");
    expect(cached).toContain("/_next/static/css/app.css");
    expect(cached).toContain("/_next/static/media/archivo.woff2");
    expect(cached.every((k) => k === "/pasar-lista-sin-conexion" || k.startsWith("/_next/static/"))).toBe(true);
    expect(cached.some((k) => k.startsWith("/api/") || k.startsWith("/app/"))).toBe(false);
  });

  it("si no hay red al guardar la pantalla no lanza error", async () => {
    const worker = load();
    let work: Promise<unknown> | undefined;
    worker.handlers.get("message")!({ data: { type: "CACHE_OFFLINE_SHELL" }, waitUntil: (w: Promise<unknown>) => (work = w) });
    await expect(work).resolves.toBeUndefined();
  });
});

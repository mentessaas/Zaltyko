/**
 * Guarda de red de la demo pública.
 *
 * Los componentes de /owner y /familia hablan con la API autenticada
 * (/api/v1/owner/*) mediante `fetch`. En la demo ninguna de esas llamadas debe
 * salir del navegador: la guarda sustituye a `fetch` y garantiza que
 *
 *  - las lecturas de la API se contestan con datos de ejemplo, sin red;
 *  - cualquier escritura (método distinto de GET/HEAD, incluidas las acciones
 *    de servidor de Next) se rechaza y avisa de que en la demo no se guarda nada;
 *  - ninguna petición llega a la base de datos de Supabase;
 *  - nada pide el panel real (/owner, /familia): ni la navegación ni la
 *    precarga de enlaces de Next, que de otro modo traería páginas con datos de
 *    la cuenta de quien tenga una sesión abierta;
 *  - el envío de la medición pública pasa, sin avisar: es lo único que escribe
 *    y no guarda nada del producto (si no, avisar generaría su propio evento);
 *  - lo demás (la navegación de Next, los recursos estáticos) pasa sin cambios.
 *
 * El rechazo usa el mismo formato problem+json que la API real y el tipo
 * «forbidden», que las pantallas tratan como una negativa definitiva: no dejan
 * reintentos pendientes ni estados «no sabemos si se guardó».
 *
 * Módulo puro: sin base de datos y sin importar nada del servidor.
 */

export const DEMO_NOTICE = "En la demo no se guarda nada";
export const DEMO_NOTICE_DETAIL =
  "En la demo no se guarda nada. Crea tu academia gratis para guardar tus datos.";

/** Contesta una lectura de la API con un cuerpo JSON; undefined si no la conoce. */
export type DemoApiResponder = (request: {
  pathname: string;
  searchParams: URLSearchParams;
}) => unknown | undefined;

export type DemoRequestOutcome =
  | "served"
  | "not-found"
  | "write-blocked"
  | "database-blocked"
  | "panel-blocked"
  | "analytics"
  | "passed";

/** Receptor público de la medición; el único POST que la demo deja salir. */
export const DEMO_ANALYTICS_PATH = "/api/growth/events";
/** Rutas del panel real: la demo nunca las pide ni las precarga. */
const REAL_PANEL_PREFIXES = ["/owner", "/familia"] as const;

function isRealPanelPath(pathname: string): boolean {
  return REAL_PANEL_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export interface DemoFetchOptions {
  /** Origen de la página; lo que no es de este origen no se toca (salvo la base de datos). */
  origin: string;
  /** `fetch` original, para lo que la demo deja pasar. */
  baseFetch: typeof fetch;
  responders: readonly DemoApiResponder[];
  /** Se llama una vez por cada escritura rechazada. */
  onWriteBlocked?: () => void;
  /** Observador de cada petición, útil para las pruebas. */
  onRequest?: (summary: { method: string; pathname: string; outcome: DemoRequestOutcome }) => void;
}

const READ_METHODS = new Set(["GET", "HEAD"]);
const DATABASE_HOST_SUFFIXES = [".supabase.co", ".supabase.in"];

function problem(status: number, type: string, title: string, detail: string): Response {
  return new Response(JSON.stringify({ type: `https://zaltyko.com/problems/${type}`, title, status, detail }), {
    status,
    headers: { "content-type": "application/problem+json" },
  });
}

export function demoBlockedResponse(): Response {
  return problem(403, "forbidden", "Acción no disponible en la demo", DEMO_NOTICE_DETAIL);
}

function demoNotFoundResponse(): Response {
  return problem(404, "not-found", "No disponible en la demo", "Este dato no forma parte de la demo.");
}

function describe(input: RequestInfo | URL, init: RequestInit | undefined, origin: string) {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
  return { url: new URL(raw, origin), method };
}

export function createDemoFetch(options: DemoFetchOptions): typeof fetch {
  const { origin, baseFetch, responders, onWriteBlocked, onRequest } = options;
  const report = (method: string, pathname: string, outcome: DemoRequestOutcome) =>
    onRequest?.({ method, pathname, outcome });

  const demoFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const { url, method } = describe(input, init, origin);

    // La base de datos queda fuera de la demo, venga de donde venga la llamada.
    if (DATABASE_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix))) {
      report(method, url.pathname, "database-blocked");
      return demoBlockedResponse();
    }

    if (url.origin !== origin) {
      report(method, url.pathname, "passed");
      return baseFetch(input, init);
    }

    if (method === "POST" && url.pathname === DEMO_ANALYTICS_PATH) {
      report(method, url.pathname, "analytics");
      return baseFetch(input, init);
    }

    if (!READ_METHODS.has(method)) {
      report(method, url.pathname, "write-blocked");
      onWriteBlocked?.();
      return demoBlockedResponse();
    }

    if (isRealPanelPath(url.pathname)) {
      // Precarga o navegación hacia el panel real: sin red y sin aviso.
      report(method, url.pathname, "panel-blocked");
      return demoNotFoundResponse();
    }

    if (url.pathname.startsWith("/api/")) {
      for (const responder of responders) {
        const body = responder({ pathname: url.pathname, searchParams: url.searchParams });
        if (body !== undefined) {
          report(method, url.pathname, "served");
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
      }
      report(method, url.pathname, "not-found");
      return demoNotFoundResponse();
    }

    report(method, url.pathname, "passed");
    return baseFetch(input, init);
  };

  return demoFetch as typeof fetch;
}

/**
 * Sustituye `window.fetch` por la guarda y devuelve la función que lo restaura.
 * Es idempotente: instalar dos veces no apila guardas.
 */
export function installDemoFetch(target: { fetch: typeof fetch; location: { origin: string } }, options: Omit<DemoFetchOptions, "origin" | "baseFetch">): () => void {
  const marker = "__zaltykoDemoFetch";
  const holder = target as unknown as Record<string, unknown>;
  if (holder[marker]) return () => undefined;
  const original = target.fetch;
  const baseFetch = ((input: RequestInfo | URL, init?: RequestInit) => original.call(target, input, init)) as typeof fetch;
  target.fetch = createDemoFetch({ ...options, origin: target.location.origin, baseFetch });
  holder[marker] = true;
  return () => {
    target.fetch = original;
    delete holder[marker];
  };
}

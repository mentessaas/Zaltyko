/**
 * Rutas de la demo pública (/demo).
 *
 * La demo reutiliza los componentes reales de /owner y /familia, que tienen sus
 * enlaces escritos contra esas rutas. Este módulo traduce una ruta real a su
 * equivalente de la demo, de modo que ningún enlace saque a una persona sin
 * cuenta hacia un panel que la mandaría al inicio de sesión.
 *
 * Módulo puro: sin base de datos, sin red y sin importar nada del servidor.
 */

export const DEMO_BASE_PATH = "/demo";
/** Destino de toda sección real que la demo no incluye. */
export const DEMO_UNAVAILABLE_PATH = "/demo/mas";

const REAL_TO_DEMO: ReadonlyArray<readonly [string, string]> = [
  ["/owner", "/demo"],
  ["/owner/classes", "/demo/clases"],
  ["/owner/attendance", "/demo/asistencia"],
  ["/owner/athletes", "/demo/gimnastas"],
  ["/owner/payments", "/demo/cuotas"],
  ["/owner/monthly-invoices", "/demo/cuotas"],
  ["/familia", "/demo/familia"],
  ["/familia/cuotas", "/demo/familia/cuotas"],
];

const PLACEHOLDER_ORIGIN = "https://demo.invalid";

function normalizePath(pathname: string): string {
  return pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
}

/**
 * Equivalente en la demo de un enlace a /owner o /familia, o null si el enlace
 * no apunta a esas rutas (por ejemplo, el registro o una página pública).
 * Se descartan la consulta y el ancla: pertenecían a una academia real.
 */
export function demoHrefFor(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return null;
  const path = normalizePath(url.pathname);
  const isReal =
    path === "/owner" ||
    path.startsWith("/owner/") ||
    path === "/familia" ||
    path.startsWith("/familia/");
  if (!isReal) return null;
  const exact = REAL_TO_DEMO.find(([from]) => from === path);
  if (exact) return exact[1];
  const athlete = /^\/familia\/gimnastas\/([^/]+)$/.exec(path);
  if (athlete) return `/demo/familia/gimnastas/${athlete[1]}`;
  return DEMO_UNAVAILABLE_PATH;
}

/**
 * Ruta real que corresponde a una ruta de la demo. La navegación del panel
 * decide qué apartado está activo comparando contra las rutas reales.
 */
export function realPathForDemoPath(pathname: string): string {
  const path = normalizePath(pathname);
  const exact = REAL_TO_DEMO.find(([, to]) => to === path);
  // /demo/cuotas coincide con dos rutas reales; la de cobros es la visible.
  if (path === "/demo/cuotas") return "/owner/payments";
  return exact ? exact[0] : pathname;
}

export function isDemoPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === DEMO_BASE_PATH || path.startsWith(`${DEMO_BASE_PATH}/`);
}

/**
 * Helper para resolver un subdominio a una academia.
 *
 * Ejemplo: si el host es `akros-madrid.zaltyko.com` y `akros-madrid` está
 * configurado como subdominio activo de una academia, devuelve la academia.
 *
 * Uso:
 *   - En el middleware de Next.js para reescribir `https://akros-madrid.zaltyko.com/`
 *     a `https://zaltyko.com/a/akros-madrid` internamente
 *   - En el helper para generar canonical URLs en SEO
 */

const ROOT_DOMAIN = "zaltyko.com";
const LOCAL_DEV_HOSTS = new Set([
  "localhost:3000",
  "127.0.0.1:3000",
  "localhost:3001",
  "127.0.0.1:3001",
]);

/**
 * Subdominios de zaltyko.com que pertenecen a la plataforma y nunca son una
 * academia: entornos (staging), proyectos aparte (waitlist), correo (mail,
 * img.mail, r.mail, autodiscover, autoconfig) y nombres de sistema. Sin esta
 * lista, staging.zaltyko.com se reescribía a /a/staging y respondía 404.
 */
export const RESERVED_PLATFORM_SUBDOMAINS: ReadonlySet<string> = new Set([
  "www",
  "staging",
  "preview",
  "dev",
  "test",
  "qa",
  "sandbox",
  "waitlist",
  "app",
  "api",
  "admin",
  "auth",
  "status",
  "docs",
  "help",
  "blog",
  "mail",
  "smtp",
  "autodiscover",
  "autoconfig",
]);

export function extractAcademySlugFromHost(host: string | null): string | null {
  if (!host) return null;
  if (LOCAL_DEV_HOSTS.has(host)) return null;
  const hostname = host.split(":")[0] ?? host;
  if (hostname === ROOT_DOMAIN) return null;
  if (!hostname.endsWith(`.${ROOT_DOMAIN}`)) return null;
  const slug = hostname.slice(0, -(ROOT_DOMAIN.length + 1));
  if (!slug || slug.includes(".")) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) return null;
  if (RESERVED_PLATFORM_SUBDOMAINS.has(slug)) return null;
  return slug;
}

export function isZaltykoSubdomain(host: string | null): boolean {
  return extractAcademySlugFromHost(host) !== null;
}

export function canonicalAcademyUrl(opts: {
  slug: string;
  subdomainEnabled: boolean;
  protocol?: string;
}): string {
  const proto = opts.protocol ?? "https";
  return opts.subdomainEnabled
    ? `${proto}://${opts.slug}.zaltyko.com/`
    : `${proto}://zaltyko.com/a/${opts.slug}`;
}

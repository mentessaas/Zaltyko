import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "crypto";
import { isDevFeaturesEnabled } from "@/lib/dev";
import { DEV_SESSION_COOKIE, parseDevSessionCookie } from "@/lib/dev-session";
import { getLocalSupabaseCspConnectSources } from "@/lib/security/local-supabase-csp";
import { extractAcademySlugFromHost } from "@/lib/subdomains/rewrite";
import { getExperimentalReleaseFlags, isExperimentalRouteDisabled } from "@/lib/release/experimental-routes";
import { isOutsideEssentialLaunch, isRetiredLaunchApi, retiredMarketingOutcome } from "@/lib/launch/essential-routes";

// Constants
const SUPER_ADMIN_PATH = "/super-admin";
const LOGIN_PATH = "/auth/login";
const SUPER_ADMIN_ROLE = "super_admin";
const PRODUCTION_SUPABASE_PROJECT_REF = "jegxfahsvugilbthbked";
// Clock skew tolerance for JWT iat validation (5 minutes)
const CLOCK_SKEW_TOLERANCE = 5 * 60;

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const RATE_LIMIT_EXCLUDED_PREFIXES = [
  "/api/stripe/webhook",
  "/api/lemonsqueezy/webhook",
  "/api/mailgun",
  "/api/cron",
  "/api/dev",
];
const EXCLUDED_PATH_PREFIXES = ["/_next", "/static", "/favicon.ico"];
const STATIC_SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-DNS-Prefetch-Control": "off",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

const CSP_SCRIPT_SOURCES_BASE = [
  "'self'",
  "https://*.supabase.co",
  "https://*.stripe.com",
  "https://vercel.live",
  "https://va.vercel-scripts.com",
  "https://*.posthog.com",
  "https://browser.sentry-cdn.com",
  "https://js.sentry-cdn.com",
];

const CSP_CONNECT_SOURCES = [
  "'self'",
  "https://api.pwnedpasswords.com",
  "https://*.supabase.co",
  "wss://*.supabase.co",
  "https://*.stripe.com",
  "https://*.posthog.com",
  "https://vercel.live",
  "https://*.sentry.io",
  "https://*.ingest.sentry.io",
  "https://*.ingest.us.sentry.io",
];

const WWW_HOSTS = new Set(["www.zaltyko.com", "www.zaltyko.test"]);

function generateNonce() {
  return crypto.randomBytes(16).toString("base64");
}

function buildCsp(nonce: string) {
  const scriptSources = [...CSP_SCRIPT_SOURCES_BASE, `'nonce-${nonce}'`];
  // Next.js dev mode usa `eval()` para el HMR runtime. En producción no hace
  // falta y mantenerlo cerrado reduce la superficie XSS. Detectamos dev con
  // NODE_ENV (Vercel lo define a "production" en cada deploy).
  if (process.env.NODE_ENV !== "production") {
    scriptSources.push("'unsafe-eval'");
  }
  const connectSources = [
    ...CSP_CONNECT_SOURCES,
    "https://*.sentry-cdn.com",
  ];
  connectSources.push(
    ...getLocalSupabaseCspConnectSources({
      nodeEnv: process.env.NODE_ENV,
      isolatedE2e: process.env.E2E_LOCAL_SUPABASE,
      vercel: process.env.VERCEL,
      vercelEnv: process.env.VERCEL_ENV,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    })
  );
  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src ${connectSources.join(" ")}`,
    "frame-src 'self' https://*.stripe.com https://*.supabase.co https://vercel.live",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://*.supabase.co",
    "object-src 'none'",
    "manifest-src 'self' https://vercel.com",
  ].join("; ");
}

function applySecurityHeaders(response: NextResponse, nonce: string) {
  for (const [header, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
    response.headers.set(header, value);
  }
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  response.headers.set("x-nonce", nonce);
  return response;
}

function apexRedirectResponse(request: NextRequest): NextResponse | null {
  if (!WWW_HOSTS.has(request.nextUrl.hostname)) return null;

  const targetUrl = new URL(request.url);
  targetUrl.hostname = request.nextUrl.hostname.slice("www.".length);
  return NextResponse.redirect(targetUrl, 301);
}

function redirectToLogin(req: NextRequest) {
  return NextResponse.redirect(new URL(LOGIN_PATH, req.url));
}

function extractAccessToken(req: NextRequest) {
  const tokenCookie = req.cookies.getAll().find(
    (cookie) => cookie.name.includes("sb-") && cookie.name.endsWith("-access-token")
  );
  if (tokenCookie?.value) return tokenCookie.value;

  // @supabase/ssr stores the browser session in a base64url encoded
  // `*-auth-token` cookie (and may split it into numbered chunks). Decode the
  // session envelope so the super-admin gate works with the canonical cookie
  // format as well as legacy access-token cookies.
  const sessionCookies = req.cookies
    .getAll()
    .filter((cookie) => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!sessionCookies.length) return null;

  try {
    const encoded = sessionCookies.map((cookie) => cookie.value).join("");
    const payload = encoded.startsWith("base64-")
      ? JSON.parse(Buffer.from(encoded.slice(7), "base64url").toString("utf8"))
      : JSON.parse(encoded);
    return typeof payload?.access_token === "string" ? payload.access_token : null;
  } catch {
    return null;
  }
}

function base64UrlDecode(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    input.length + ((4 - (input.length % 4)) % 4),
    "="
  );
  if (typeof globalThis !== "undefined" && "atob" in globalThis) {
    return (globalThis as typeof globalThis & { atob: (value: string) => string }).atob(padded);
  }
  return Buffer.from(padded, "base64").toString("utf8");
}

function verifyJwtHs256(token: string, secret: string): { valid: boolean; payload: Record<string, unknown> | null } {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { valid: false, payload: null };

    const [headerB64, payloadB64, signatureB64] = parts;
    if (!headerB64 || !payloadB64 || !signatureB64) return { valid: false, payload: null };

    const headerJson = base64UrlDecode(headerB64);
    const header = JSON.parse(headerJson) as { alg?: string; typ?: string };
    if (header.alg !== "HS256") return { valid: false, payload: null };

    const signingInput = `${headerB64}.${payloadB64}`;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(signingInput)
      .digest();

    const receivedSignature = Buffer.from(
      signatureB64.replace(/-/g, "+").replace(/_/g, "/").padEnd(
        signatureB64.length + ((4 - (signatureB64.length % 4)) % 4),
        "="
      ),
      "base64"
    );

    if (
      expectedSignature.length !== receivedSignature.length ||
      !crypto.timingSafeEqual(expectedSignature, receivedSignature)
    ) {
      return { valid: false, payload: null };
    }

    const payloadJson = base64UrlDecode(payloadB64);
    return { valid: true, payload: JSON.parse(payloadJson) as Record<string, unknown> };
  } catch {
    return { valid: false, payload: null };
  }
}

function validateClaims(payload: Record<string, unknown>): boolean {
  const now = Date.now();

  // `exp` es obligatorio: un token firmado sin expiración sería válido eterno.
  if (typeof payload.exp !== "number") {
    console.warn("JWT sin exp: rechazado");
    return false;
  }
  if (now >= payload.exp * 1000) {
    console.warn("JWT expired");
    return false;
  }

  if (typeof payload.iat === "number" && now < (payload.iat - CLOCK_SKEW_TOLERANCE) * 1000) {
    console.warn("JWT issued in the future");
    return false;
  }

  return true;
}

async function verifySuperAdminWithSupabase(accessToken: string): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return false;

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });
    if (!response.ok) return false;
    const user = (await response.json()) as Record<string, unknown>;
    return extractRole(user) === SUPER_ADMIN_ROLE;
  } catch {
    return false;
  }
}

function isSuperAdminPath(pathname: string) {
  return pathname.startsWith(SUPER_ADMIN_PATH);
}

function isApiPath(pathname: string) {
  return pathname.startsWith("/api/");
}

function isPreviewMutationPointingAtProduction(req: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview" || !isMutation(req.method)) return false;

  return [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_POOL,
    process.env.DATABASE_URL_DIRECT,
  ].some((value) => {
    if (!value) return false;
    try {
      const target = new URL(value);
      const identity = `${target.hostname} ${decodeURIComponent(target.username)} ${target.pathname}`;
      return identity.includes(PRODUCTION_SUPABASE_PROJECT_REF);
    } catch {
      return false;
    }
  });
}

function isMutation(method: string) {
  return MUTATING_METHODS.has(method.toUpperCase());
}

function isApiRateLimitExcluded(pathname: string) {
  return RATE_LIMIT_EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isExcludedPath(pathname: string) {
  return EXCLUDED_PATH_PREFIXES.some((path) => pathname.startsWith(path));
}

function isAcademyAppPath(pathname: string) {
  // /app se retiró (redirect permanente en next.config.mjs); solo queda el super-admin.
  return pathname.startsWith("/super-admin/");
}

/** Read-only family portal (P2 #16): data about minors, never cached. */
function isFamilyPortalPath(pathname: string) {
  return pathname === "/familia" || pathname.startsWith("/familia/");
}

async function checkRateLimit(
  req: NextRequest,
  body: Record<string, unknown>
): Promise<{ blockedResponse: NextResponse | null; headers: Record<string, string> }> {
  const pathname = req.nextUrl.pathname;
  const { rateLimit, getLimitForRoute, getClientIdentifier } = await import("@/lib/rate-limit");
  const identifier = `${pathname}:${getClientIdentifier(req)}`;
  const result = await rateLimit({
    identifier,
    ...getLimitForRoute(pathname),
    // Owner API routes always re-verify session and tenant before acting.
    onBackendError: pathname.startsWith("/api/v1/owner/") ? "allow" : "deny",
  });
  const resetSeconds = Math.max(0, result.reset - Math.floor(Date.now() / 1000));
  const headers = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.reset),
  };

  if (result.success) {
    return { blockedResponse: null, headers };
  }

  return {
    blockedResponse: new NextResponse(JSON.stringify(body), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        ...headers,
        "Retry-After": String(resetSeconds),
      },
    }),
    headers,
  };
}

function extractRole(payload: Record<string, unknown> | null) {
  if (!payload) return null;
  const appMetadata = payload.app_metadata as Record<string, unknown> | undefined;
  return (
    appMetadata?.role ??
    // E2E identities use a namespaced claim so production role metadata is
    // never overwritten by test provisioning.
    appMetadata?.e2eRole ??
    payload.role ??
    null
  );
}

function launchClosedResponse(status: 404 | 410, nonce: string): NextResponse {
  const response = status === 410
    ? NextResponse.json(
      { ok: false, error: "ROUTE_RETIRED", code: "ROUTE_RETIRED", message: "Este servicio no forma parte de Zaltyko." },
      { status: 410 }
    )
    : new NextResponse(null, { status: 404 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return applySecurityHeaders(response, nonce);
}

// Human-readable 410 for a retired public page: whoever arrives from a search
// result sees where to go instead of an empty body or a JSON error. Minimal
// «Magnesio sobre tapiz» styling in a plain <style> block (the CSP allows
// inline styles; no nonce, fonts or external assets needed).
const RETIRED_PAGE_STYLE = "body{margin:0;min-height:100vh;display:flex;flex-direction:column;"
  + "font-family:Archivo,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;"
  + "background:#F4F6F2;color:#0B1430}"
  + "header{background:#14307F;height:4rem;display:flex;align-items:center;padding:0 1.25rem}"
  + "header a{color:#fff;font-weight:900;font-stretch:72%;letter-spacing:.02em;font-size:1.125rem;text-decoration:none}"
  + "main{flex:1;width:100%;max-width:42rem;box-sizing:border-box;margin:0 auto;padding:4rem 1.5rem;"
  + "display:flex;flex-direction:column;justify-content:center}"
  + "h1{margin:0;font-size:clamp(2.25rem,5vw,4rem);font-weight:900;font-stretch:72%;line-height:.92;text-transform:uppercase}"
  + "p{margin:0;color:#3E4A66;line-height:1.75}"
  + ".lede{margin-top:1.5rem;padding-top:1.25rem;border-top:3px solid #0B1430}"
  + ".actions{margin-top:2rem;display:flex;flex-wrap:wrap;gap:.75rem}"
  + ".actions a{display:inline-flex;align-items:center;min-height:44px;box-sizing:border-box;padding:0 1.5rem;"
  + "border-radius:8px;font-size:.875rem;font-weight:600;text-decoration:none}"
  + ".primary{background:#1E3FA8;color:#fff;box-shadow:0 1px 0 rgba(11,20,48,.25)}.primary:hover{background:#14307F}"
  + ".outline{background:#fff;color:#0B1430;border:1px solid #B4BCCB}.outline:hover{border-color:#1E3FA8;color:#1E3FA8}"
  + "a:focus-visible{outline:2px solid #1E3FA8;outline-offset:2px}header a:focus-visible{outline-color:#fff}";

function retiredPageResponse(nonce: string): NextResponse {
  const body = '<!doctype html><html lang="es"><head><meta charset="utf-8">'
    + '<meta name="robots" content="noindex, nofollow"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta name="theme-color" content="#14307F">'
    + `<title>Esta página ya no existe | Zaltyko</title><style>${RETIRED_PAGE_STYLE}</style></head><body>`
    + '<header><a href="/" aria-label="Zaltyko, inicio">ZALTYKO</a></header>'
    + "<main><h1>Esta página ya no existe</h1>"
    + '<p class="lede">El contenido que buscas se ha retirado de Zaltyko.</p>'
    + '<p class="actions"><a class="primary" href="/">Ir a la portada</a><a class="outline" href="/features">Ver qué incluye Zaltyko</a></p>'
    + "</main></body></html>";
  const response = new NextResponse(body, {
    status: 410,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  response.headers.set("Cache-Control", "public, max-age=3600");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return applySecurityHeaders(response, nonce);
}

export async function middleware(req: NextRequest) {
  const nonce = generateNonce();
  if (isPreviewMutationPointingAtProduction(req)) {
    const blocked = NextResponse.json(
      { error: "PREVIEW_WRITE_BLOCKED", message: "Escrituras deshabilitadas en Preview." },
      { status: 503 }
    );
    blocked.headers.set("Cache-Control", "no-store");
    return applySecurityHeaders(blocked, nonce);
  }

  const apexRedirect = apexRedirectResponse(req);
  if (apexRedirect) return applySecurityHeaders(apexRedirect, nonce);

  const experimentalFlags = getExperimentalReleaseFlags();

  // T6: rewrite academy subdomains [slug].zaltyko.com → /a/[slug]
  const host = req.headers.get("host");
  const slug = extractAcademySlugFromHost(host);
  if (slug) {
    if (isExperimentalRouteDisabled(`/a/${slug}`, experimentalFlags)) {
      return launchClosedResponse(404, nonce);
    }
    const url = req.nextUrl.clone();
    url.pathname = `/a/${slug}${url.pathname === "/" ? "" : url.pathname}`;
    // A rewrite does not run middleware again: apply the launch cut to the
    // rewritten path so club.zaltyko.com/tienda stays closed like /a/club/tienda.
    if (isOutsideEssentialLaunch(url.pathname)) return launchClosedResponse(404, nonce);
    url.host = "zaltyko.com";
    url.protocol = "https:";
    return applySecurityHeaders(NextResponse.rewrite(url), nonce);
  }

  const pathname = req.nextUrl.pathname;

  // The launch cut runs before the experimental flags, so no environment
  // variable can reopen the historical store, Stripe Connect checkout or
  // marketplace: they cannot become a second purchasing entry point.
  // Retired APIs answer 410 before any rate limiter or handler runs.
  if (isRetiredLaunchApi(pathname)) return launchClosedResponse(410, nonce);
  // Respond before App Router can stream a 200 for a retired page's notFound().
  if (isOutsideEssentialLaunch(pathname)) return launchClosedResponse(404, nonce);
  // Retired marketing pages still listed by search engines: a permanent 301
  // to the closest live page, or 410 Gone when nothing replaces them. A 307
  // here kept the old URLs indexed as if they might come back. This also
  // covers every modality cluster the old i18n redirect used to localize
  // (/gimnasia-ritmica → /es/gimnasia-ritmica), so that redirect is gone.
  const retiredMarketing = retiredMarketingOutcome(pathname);
  if (retiredMarketing?.status === 301) {
    const target = new URL(retiredMarketing.location, req.url);
    return applySecurityHeaders(NextResponse.redirect(target, 301), nonce);
  }
  if (retiredMarketing?.status === 410) return retiredPageResponse(nonce);

  // Disabled experimental pages (/a, /c, /g, /p, actor sitemap…) are 404 with
  // noindex, like the launch cut, so crawlers drop any URL they kept.
  if (isExperimentalRouteDisabled(pathname, experimentalFlags)) {
    return launchClosedResponse(404, nonce);
  }

  if (isExcludedPath(pathname)) {
    return applySecurityHeaders(NextResponse.next(), nonce);
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  // Keep a namespaced copy for App Router server layouts. Some Next runtimes
  // strip the generic x-pathname header before it reaches headers().
  requestHeaders.set("x-zaltyko-pathname", pathname);
  let rateLimitHeaders: Record<string, string> | null = null;

  // 1. Rate limit API mutations globally (skips webhooks and crons)
  if (isApiPath(pathname) && isMutation(req.method) && !isApiRateLimitExcluded(pathname)) {
    const rateLimitResult = await checkRateLimit(req, {
      ok: false,
      error: "RATE_LIMIT_EXCEEDED",
      code: "RATE_LIMIT_EXCEEDED",
      message: "Demasiadas requests. Intenta de nuevo más tarde.",
    });
    if (rateLimitResult.blockedResponse) {
      return applySecurityHeaders(rateLimitResult.blockedResponse, nonce);
    }
    rateLimitHeaders = rateLimitResult.headers;
  }

  // 1b. Rate limit GETs públicos: endpoints anónimos con count(*) por
  // petición; sin esto, un loop barato fuerza escaneos completos sin medir.
  if (isApiPath(pathname) && !isMutation(req.method) && pathname.startsWith("/api/public")) {
    const rateLimitResult = await checkRateLimit(req, {
      limit: 60,
      window: 60,
      error: "RATE_LIMIT_EXCEEDED",
      code: "RATE_LIMIT_EXCEEDED",
      message: "Demasiadas requests. Intenta de nuevo más tarde.",
    });
    if (rateLimitResult.blockedResponse) {
      return applySecurityHeaders(rateLimitResult.blockedResponse, nonce);
    }
    rateLimitHeaders = rateLimitResult.headers;
  }

  // 2. Rate limit academy app, super-admin and family portal paths
  if (isAcademyAppPath(pathname) || isFamilyPortalPath(pathname)) {
    const rateLimitResult = await checkRateLimit(req, {
      error: "RATE_LIMIT_EXCEEDED",
      message: "Demasiadas requests. Intenta de nuevo más tarde.",
    });
    if (rateLimitResult.blockedResponse) {
      return applySecurityHeaders(rateLimitResult.blockedResponse, nonce);
    }
    rateLimitHeaders = rateLimitResult.headers;
  }

  // 3. Super-admin gate: validate JWT signature AND claims
  if (isSuperAdminPath(pathname)) {
    const hasDevSession =
      isDevFeaturesEnabled &&
      Boolean(parseDevSessionCookie(req.cookies.get(DEV_SESSION_COOKIE)?.value));

    if (!hasDevSession) {
      const token = extractAccessToken(req);
      if (!token) return applySecurityHeaders(redirectToLogin(req), nonce);

      const secret = process.env.SUPABASE_JWT_SECRET;
      if (secret) {
        const { valid, payload } = verifyJwtHs256(token, secret);
        if (!valid || !payload || !validateClaims(payload)) {
          return applySecurityHeaders(redirectToLogin(req), nonce);
        }

        if (extractRole(payload) !== SUPER_ADMIN_ROLE) {
          return applySecurityHeaders(redirectToLogin(req), nonce);
        }
      } else if (!(await verifySuperAdminWithSupabase(token))) {
        // Verify remotely when the project JWT secret is not available in the
        // deployment environment. Never trust an unverified client claim.
        return applySecurityHeaders(redirectToLogin(req), nonce);
      }
    }
  }

  requestHeaders.set("x-nonce", nonce);
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (rateLimitHeaders) {
    for (const [header, value] of Object.entries(rateLimitHeaders)) {
      response.headers.set(header, value);
    }
  }

  // X-Robots-Tag is decided locally (launch cut, /staff/accept below); the
  // middleware never fetches to decide indexing. Academy detail pages set
  // their own robots metadata if they are ever reopened.

  const securedResponse = applySecurityHeaders(response, nonce);
  if (pathname === "/staff/accept" || isFamilyPortalPath(pathname)) {
    securedResponse.headers.set("Referrer-Policy", "no-referrer");
    securedResponse.headers.set("Cache-Control", "private, no-store");
    securedResponse.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  return securedResponse;
}

// Next.js reads src/middleware.ts (it sits beside src/app); keep this copy
// identical so the two declarations cannot drift.
export const config = {
  matcher: [
    "/api/:path*",
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "crypto";
import { isDevFeaturesEnabled } from "@/lib/dev";
import { DEV_SESSION_COOKIE, parseDevSessionCookie } from "@/lib/dev-session";
import { locales, defaultLocale, type Locale } from "@/i18n";

// Constants
const SUPER_ADMIN_PATH = "/super-admin";
const LOGIN_PATH = "/auth/login";
const SUPER_ADMIN_ROLE = "super_admin";
// Clock skew tolerance for JWT iat validation (5 minutes)
const CLOCK_SKEW_TOLERANCE = 5 * 60;
const LOCALE_COOKIE_NAME = "zaltyko-locale";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const RATE_LIMIT_EXCLUDED_PREFIXES = [
  "/api/stripe/webhook",
  "/api/lemonsqueezy/webhook",
  "/api/mailgun",
  "/api/cron",
  "/api/dev",
];
const EXCLUDED_PATH_PREFIXES = ["/_next", "/static", "/favicon.ico"];
const I18N_SKIP_PREFIXES = ["/api", "/auth", "/login", "/invite"];
// `/ayuda` and `/sobre-nosotros` are the canonical routes. Their legacy
// locale-prefixed handlers redirect back to these paths, so localizing the
// canonical URLs here would create an infinite redirect loop.
const I18N_REDIRECT_EXACT_PATHS = new Set(["/"]);
const I18N_MODALITY_PREFIXES = [
  "/gimnasia-artistica",
  "/gimnasia-ritmica",
  "/gimnasia-acrobatica",
  "/trampolin",
  "/artistic-gymnastics",
  "/rhythmic-gymnastics",
  "/acrobatic-gymnastics",
  "/trampoline",
];

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

  if (typeof payload.exp === "number" && now >= payload.exp * 1000) {
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

function isMutation(method: string) {
  return MUTATING_METHODS.has(method.toUpperCase());
}

function isApiRateLimitExcluded(pathname: string) {
  return RATE_LIMIT_EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isExcludedPath(pathname: string) {
  return EXCLUDED_PATH_PREFIXES.some((path) => pathname.startsWith(path));
}

function isI18nSkipped(pathname: string) {
  if (pathname.includes(".")) return true;
  return I18N_SKIP_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function shouldRedirectToLocalizedRoute(pathname: string) {
  return (
    I18N_REDIRECT_EXACT_PATHS.has(pathname) ||
    I18N_MODALITY_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  );
}

function isAcademyAppPath(pathname: string) {
  return pathname.startsWith("/app/") || pathname.startsWith("/super-admin/");
}

async function checkRateLimit(
  req: NextRequest,
  body: Record<string, unknown>
): Promise<{ blockedResponse: NextResponse | null; headers: Record<string, string> }> {
  const pathname = req.nextUrl.pathname;
  const { rateLimit, getLimitForRoute, getClientIdentifier } = await import("@/lib/rate-limit");
  const identifier = `${pathname}:${getClientIdentifier(req)}`;
  const result = await rateLimit({ identifier, ...getLimitForRoute(pathname) });
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

function getLocaleFromRequest(request: NextRequest): Locale {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  if (cookieLocale === "es" || cookieLocale === "en") {
    return cookieLocale;
  }

  const acceptLanguage = request.headers.get("accept-language");
  if (acceptLanguage) {
    const normalized = acceptLanguage.toLowerCase().split("-")[0];
    if (normalized === "en") return "en";
    if (normalized === "es") return "es";
  }

  return defaultLocale;
}

function i18nRedirectResponse(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;

  if (isI18nSkipped(pathname)) return null;

  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );
  if (pathnameHasLocale) return null;
  if (!shouldRedirectToLocalizedRoute(pathname)) return null;

  const locale = getLocaleFromRequest(request);

  // Special case: root path needs a default modality because there's no
  // page handler at /(site)/[locale]/page.tsx — only /(site)/[locale]/[modality].
  // Redirect `/` to `/${locale}/gimnasia-artistica` (first modality in catalog).
  let targetPath = pathname;
  if (pathname === "/") {
    targetPath = `/${locale}/gimnasia-artistica`;
  } else {
    targetPath = `/${locale}${pathname}`;
  }

  const newUrl = new URL(targetPath, request.url);
  request.nextUrl.searchParams.forEach((value, key) => {
    newUrl.searchParams.set(key, value);
  });

  const response = NextResponse.redirect(newUrl);
  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: false,
    sameSite: "lax",
  });
  return response;
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  if (isExcludedPath(pathname)) {
    return NextResponse.next();
  }

  // 0. i18n redirect (must run before any other gate)
  const i18nResponse = i18nRedirectResponse(req);
  if (i18nResponse) return i18nResponse;

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
    if (rateLimitResult.blockedResponse) return rateLimitResult.blockedResponse;
    rateLimitHeaders = rateLimitResult.headers;
  }

  // 2. Rate limit academy app + super-admin paths
  if (isAcademyAppPath(pathname)) {
    const rateLimitResult = await checkRateLimit(req, {
      error: "RATE_LIMIT_EXCEEDED",
      message: "Demasiadas requests. Intenta de nuevo más tarde.",
    });
    if (rateLimitResult.blockedResponse) return rateLimitResult.blockedResponse;
    rateLimitHeaders = rateLimitResult.headers;
  }

  // 3. Super-admin gate: validate JWT signature AND claims
  if (isSuperAdminPath(pathname)) {
    const hasDevSession =
      isDevFeaturesEnabled &&
      Boolean(parseDevSessionCookie(req.cookies.get(DEV_SESSION_COOKIE)?.value));

    if (!hasDevSession) {
      const token = extractAccessToken(req);
      if (!token) return redirectToLogin(req);

      const secret = process.env.SUPABASE_JWT_SECRET;
      if (secret) {
        const { valid, payload } = verifyJwtHs256(token, secret);
        if (!valid || !payload || !validateClaims(payload)) {
          return redirectToLogin(req);
        }

        if (extractRole(payload) !== SUPER_ADMIN_ROLE) {
          return redirectToLogin(req);
        }
      } else if (!(await verifySuperAdminWithSupabase(token))) {
        // Verify remotely when the project JWT secret is not available in the
        // deployment environment. Never trust an unverified client claim.
        return redirectToLogin(req);
      }
    }
  }

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

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

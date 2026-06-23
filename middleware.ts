import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "crypto";
import { isDevFeaturesEnabled } from "@/lib/dev";
import { DEV_SESSION_COOKIE, parseDevSessionCookie } from "@/lib/dev-session";

// Constants
const SUPER_ADMIN_PATH = "/super-admin";
const LOGIN_PATH = "/auth/login";
const SUPER_ADMIN_ROLE = "super_admin";
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

function redirectToLogin(req: NextRequest) {
  return NextResponse.redirect(new URL(LOGIN_PATH, req.url));
}

function extractAccessToken(req: NextRequest) {
  const tokenCookie = req.cookies.getAll().find(
    (cookie) => cookie.name.includes("sb-") && cookie.name.endsWith("-access-token")
  );
  return tokenCookie?.value ?? null;
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

function isAcademyAppPath(pathname: string) {
  return pathname.startsWith("/app/") || pathname.startsWith("/super-admin/");
}

async function rateLimitResponse(
  req: NextRequest,
  body: Record<string, unknown>
): Promise<NextResponse> {
  const pathname = req.nextUrl.pathname;
  const { rateLimit, getLimitForRoute, getClientIdentifier } = await import("@/lib/rate-limit");
  const identifier = `${pathname}:${getClientIdentifier(req)}`;
  const result = await rateLimit({ identifier, ...getLimitForRoute(pathname) });
  const resetSeconds = Math.max(0, result.reset - Math.floor(Date.now() / 1000));

  return new NextResponse(JSON.stringify(body), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": String(result.reset),
      "Retry-After": String(resetSeconds),
    },
  });
}

function extractRole(payload: Record<string, unknown> | null) {
  if (!payload) return null;
  return (
    (payload.app_metadata as Record<string, unknown>)?.role ??
    payload.role ??
    null
  );
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  if (isExcludedPath(pathname)) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);

  // 1. Rate limit API mutations globally (skips webhooks and crons)
  if (isApiPath(pathname) && isMutation(req.method) && !isApiRateLimitExcluded(pathname)) {
    return await rateLimitResponse(req, {
      ok: false,
      error: "RATE_LIMIT_EXCEEDED",
      code: "RATE_LIMIT_EXCEEDED",
      message: "Demasiadas requests. Intenta de nuevo más tarde.",
    });
  }

  // 2. Rate limit academy app + super-admin paths
  if (isAcademyAppPath(pathname)) {
    return await rateLimitResponse(req, {
      error: "RATE_LIMIT_EXCEEDED",
      message: "Demasiadas requests. Intenta de nuevo más tarde.",
    });
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
      if (!secret) {
        console.error("SUPABASE_JWT_SECRET not configured; rejecting super-admin access");
        return redirectToLogin(req);
      }

      const { valid, payload } = verifyJwtHs256(token, secret);
      if (!valid || !payload || !validateClaims(payload)) {
        return redirectToLogin(req);
      }

      if (extractRole(payload) !== SUPER_ADMIN_ROLE) {
        return redirectToLogin(req);
      }
    }
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};


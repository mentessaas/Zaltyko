import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Constants
const SUPER_ADMIN_PATH = "/super-admin";
const LOGIN_PATH = "/auth/login";
const SUPER_ADMIN_ROLE = "super_admin";
// Clock skew tolerance for JWT iat validation (5 minutes)
const CLOCK_SKEW_TOLERANCE = 5 * 60;

// Rate limit excludes
const EXCLUDED_PATHS = ["/_next", "/static"];

function redirectToLogin(req: NextRequest) {
  return NextResponse.redirect(new URL(LOGIN_PATH, req.url));
}

function extractAccessToken(req: NextRequest) {
  const tokenCookie = req.cookies.getAll().find(
    (cookie) => cookie.name.includes("sb-") && cookie.name.endsWith("-access-token")
  );
  return tokenCookie?.value ?? null;
}

function base64Decode(input: string) {
  if (typeof globalThis !== "undefined" && "atob" in globalThis) {
    return (globalThis as typeof globalThis & { atob: (value: string) => string }).atob(input);
  }
  return Buffer.from(input, "base64").toString("utf8");
}

function decodeJwtPayload(token: string) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const base64 = parts[1]?.replace(/-/g, "+").replace(/_/g, "/").padEnd(
      parts[1].length + ((4 - (parts[1].length % 4)) % 4),
      "="
    );
    if (!base64) return null;

    const payloadObj = JSON.parse(base64Decode(base64));
    const now = Date.now();

    if (payloadObj.exp && now >= payloadObj.exp * 1000) {
      console.warn("JWT expired");
      return null;
    }

    // Reject tokens issued in the future (clock skew > tolerance)
    if (payloadObj.iat && now < (payloadObj.iat - CLOCK_SKEW_TOLERANCE) * 1000) {
      console.warn("JWT issued in the future");
      return null;
    }

    return payloadObj;
  } catch {
    return null;
  }
}

function isSuperAdminPath(pathname: string) {
  return pathname.startsWith(SUPER_ADMIN_PATH);
}

function isExcludedPath(pathname: string) {
  return EXCLUDED_PATHS.some((path) => pathname.startsWith(path));
}

async function applyRateLimit(req: NextRequest) {
  if (isExcludedPath(req.nextUrl.pathname)) return null;

  try {
    const { rateLimit, getLimitForRoute, getClientIdentifier } = await import("@/lib/rate-limit");

    const pathname = req.nextUrl.pathname;
    const result = await rateLimit({
      identifier: `${pathname}:${getClientIdentifier(req)}`,
      ...getLimitForRoute(pathname),
    });

    if (!result.success) {
      return new NextResponse(JSON.stringify({
        error: "RATE_LIMIT_EXCEEDED",
        message: "Demasiadas requests. Intenta de nuevo más tarde."
      }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(result.reset),
          "Retry-After": String(result.reset - Math.floor(Date.now() / 1000)),
        }
      });
    }
    return null;
  } catch (error) {
    console.error("Rate limit error in middleware:", error);
    return null;
  }
}

function extractRole(payload: Record<string, unknown> | null) {
  if (!payload) return null;
  return (
    (payload.user_metadata as Record<string, unknown>)?.role ??
    (payload.app_metadata as Record<string, unknown>)?.role ??
    payload.role ??
    null
  );
}

export async function middleware(req: NextRequest) {
  // Skip non-super-admin paths
  if (!isSuperAdminPath(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // Apply rate limiting
  const rateLimitResponse = await applyRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  // Validate JWT token
  const token = extractAccessToken(req);
  if (!token) return redirectToLogin(req);

  const payload = decodeJwtPayload(token);
  if (!payload) return redirectToLogin(req);

  if (extractRole(payload) !== SUPER_ADMIN_ROLE) {
    return redirectToLogin(req);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/super-admin/:path*"],
};


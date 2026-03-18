import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SUPER_ADMIN_COOKIE_HINTS = ["role", "profile", "super-admin"];

// Supabase validation (reserved for future use)
// const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// const SUPABASE_ANN = process.env.SUPABASE_ANN_KEY || "ann";

function extractAccessToken(req: NextRequest) {
  const cookies = req.cookies.getAll();
  const candidate = cookies.find((cookie) =>
    cookie.name.includes("sb-") && cookie.name.endsWith("-access-token")
  );
  return candidate?.value ?? null;
}

function base64Decode(input: string) {
  if (typeof globalThis !== "undefined" && "atob" in globalThis) {
    return (globalThis as typeof globalThis & { atob: (value: string) => string }).atob(input);
  }
  // Fallback para Node.js
  return Buffer.from(input, "base64").toString("utf8");
}

function decodeJwtPayload(token: string) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = parts[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = base64Decode(padded);
    const payloadObj = JSON.parse(json);

    // Validar que el token no está expirado
    if (payloadObj.exp && Date.now() >= payloadObj.exp * 1000) {
      console.warn("JWT expired");
      return null;
    }

    // Validar que el token no está emitido en el futuro (tolerancia de 60s)
    if (payloadObj.iat && Date.now() >= (payloadObj.iat + 60) * 1000) {
      console.warn("JWT issued in the future");
      return null;
    }

    return payloadObj;
  } catch {
    return null;
  }
}

function tryExtractRoleFromCookies(req: NextRequest) {
  const cookies = req.cookies.getAll();
  for (const cookie of cookies) {
    if (SUPER_ADMIN_COOKIE_HINTS.some((hint) => cookie.name.includes(hint))) {
      if (cookie.value === "super_admin") return "super_admin";
      try {
        const parsed = JSON.parse(cookie.value);
        if (parsed?.role === "super_admin") {
          return "super_admin";
        }
      } catch {
        // ignore
      }
    }
  }
  return null;
}

export async function middleware(req: NextRequest) {
  // 1. Rate Limiting
  if (!req.nextUrl.pathname.startsWith("/_next") && !req.nextUrl.pathname.startsWith("/static")) {
    try {
      const { rateLimit, getLimitForRoute, getClientIdentifier } = await import("@/lib/rate-limit");

      const pathname = req.nextUrl.pathname;
      const limits = getLimitForRoute(pathname);
      const identifier = getClientIdentifier(req);

      const result = await rateLimit({
        identifier: `${pathname}:${identifier}`,
        limit: limits.limit,
        window: limits.window,
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

      // Store rate limit info to add to response later if needed, 
      // but for middleware we usually just proceed. 
      // We can add headers to the response object we return at the end.
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set("X-RateLimit-Limit", String(result.limit));
      requestHeaders.set("X-RateLimit-Remaining", String(result.remaining));
      requestHeaders.set("X-RateLimit-Reset", String(result.reset));

      // Pass these headers to the next request processing
      // (This modifies the request headers sent to the route handler)
      // To set response headers, we need to do it on the returned response
    } catch (error) {
      console.error("Rate limit error in middleware:", error);
      // Continue on error (fail open)
    }
  }

  if (!req.nextUrl.pathname.startsWith("/super-admin")) {
    return NextResponse.next();
  }

  const cookieRole = tryExtractRoleFromCookies(req);
  if (cookieRole === "super_admin") {
    return NextResponse.next();
  }

  const token = extractAccessToken(req);

  if (!token) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  const payload = decodeJwtPayload(token);

  if (!payload) {
    // Token inválido o expirado
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  const role =
    payload?.user_metadata?.role ??
    payload?.app_metadata?.role ??
    payload?.role ??
    null;

  if (role !== "super_admin") {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/super-admin/:path*"],
};


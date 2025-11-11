import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Buffer } from "buffer";

const SUPER_ADMIN_COOKIE_HINTS = ["role", "profile", "super-admin"];

function extractAccessToken(req: NextRequest) {
  const cookies = req.cookies.getAll();
  const candidate = cookies.find((cookie) =>
    cookie.name.includes("sb-") && cookie.name.endsWith("-access-token")
  );
  return candidate?.value ?? null;
}

const hasAtob = typeof globalThis !== "undefined" && "atob" in globalThis;

function base64Decode(input: string) {
  if (hasAtob) {
    return (globalThis as typeof globalThis & { atob: (value: string) => string }).atob(input);
  }
  return Buffer.from(input, "base64").toString("utf8");
}

function decodeJwtPayload(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = base64Decode(padded);
    return JSON.parse(json);
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

export function middleware(req: NextRequest) {
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


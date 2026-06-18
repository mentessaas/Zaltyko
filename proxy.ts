import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const RATE_LIMIT_EXCLUDED_PREFIXES = [
  "/api/stripe/webhook",
  "/api/lemonsqueezy/webhook",
  "/api/mailgun",
  "/api/cron",
  "/api/dev",
];

async function applyApiMutationRateLimit(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (!pathname.startsWith("/api/")) return null;
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) return null;
  if (RATE_LIMIT_EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  const { rateLimit, getLimitForRoute, getClientIdentifier } = await import("@/lib/rate-limit");
  const result = await rateLimit({
    identifier: `${pathname}:${getClientIdentifier(request)}`,
    ...getLimitForRoute(pathname),
  });

  if (result.success) return null;

  const resetSeconds = Math.max(0, result.reset - Math.floor(Date.now() / 1000));
  return NextResponse.json(
    {
      ok: false,
      error: "RATE_LIMIT_EXCEEDED",
      code: "RATE_LIMIT_EXCEEDED",
      message: "Demasiadas requests. Intenta de nuevo más tarde.",
      resetIn: resetSeconds,
    },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(result.reset),
        "Retry-After": String(resetSeconds),
      },
    }
  );
}

export async function proxy(request: NextRequest) {
  const rateLimitResponse = await applyApiMutationRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

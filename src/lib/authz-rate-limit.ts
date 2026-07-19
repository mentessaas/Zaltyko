import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { withTenant, TenantContext } from "@/lib/authz";

/**
 * Combina rate limiting con withTenant
 * Útil para endpoints que requieren ambos
 */
export function withTenantAndRateLimit(
  handler: (request: NextRequest, context: TenantContext) => Promise<NextResponse>
) {
  // Primero aplicar rate limiting, luego tenant
  return withRateLimit(
    async (request: NextRequest, context?: any) => {
      return withTenant(async (req, ctx) => {
        return handler(req as NextRequest, ctx);
      })(request, context || {});
    },
    { identifier: getUserIdentifier }
  );
}


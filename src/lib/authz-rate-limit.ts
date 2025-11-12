import { NextRequest, NextResponse } from "next/server";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { withTenant, TenantContext } from "@/lib/authz";

/**
 * Combina rate limiting con withTenant
 * Útil para endpoints que requieren ambos
 */
export function withTenantAndRateLimit<T extends any[]>(
  handler: (request: NextRequest, context: TenantContext, ...args: T) => Promise<NextResponse>
) {
  // Primero aplicar rate limiting, luego tenant
  return withRateLimit(
    (request: NextRequest) => {
      return withTenant(async (request, context, ...args: T) => {
        return handler(request, context, ...args);
      })(request);
    },
    { identifier: getUserIdentifier }
  );
}


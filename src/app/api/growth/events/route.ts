import { apiError } from "@/lib/api-response";

// @auth-flexible route-guard-reason: optional public analytics unavailable
// @route-auth public
export const dynamic = "force-dynamic";

/**
 * This optional collection circuit stays closed until an implemented consent
 * flow can be verified at the receiving boundary. A client flag, visitor ID or
 * asserted consent field is not that contract. Essential server-side business
 * milestones use their own services and do not pass through this endpoint.
 */
export async function POST(_request: Request) {
  return apiError("NOT_AVAILABLE", "La medición opcional no está disponible", 404, undefined, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

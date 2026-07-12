import { apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/** @route-auth deprecated */

function unauthorized() {
  return apiError("UNAUTHORIZED", "Authentication required", 401);
}

export const GET = unauthorized;
export const POST = unauthorized;
export const PUT = unauthorized;
export const PATCH = unauthorized;
export const DELETE = unauthorized;

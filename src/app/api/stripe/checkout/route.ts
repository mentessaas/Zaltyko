import { apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST() {
  return apiError(
    "ENDPOINT_DEPRECATED",
    "Use /api/billing/checkout. Checkout must be created from an authenticated tenant context.",
    410
  );
}

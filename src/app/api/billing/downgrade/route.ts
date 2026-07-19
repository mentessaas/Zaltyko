import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { getUserIdentifier, withRateLimit } from "@/lib/rate-limit";

const handler = withTenant(async () =>
  apiError(
    "DEPRECATED_BILLING_FLOW",
    "Este flujo fue retirado. Gestiona cambios y cancelaciones desde el portal de facturación.",
    410,
  ),
);

export const POST = withRateLimit(
  async (request) => (await handler(request, {} as never)) as NextResponse,
  { identifier: getUserIdentifier, limit: 10, window: 60 },
);

export const DELETE = withRateLimit(
  async (request) => (await handler(request, {} as never)) as NextResponse,
  { identifier: getUserIdentifier, limit: 5, window: 60 },
);

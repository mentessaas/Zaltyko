import { NextResponse } from "next/server";

import { withTenant } from "@/lib/authz";
import { apiError } from "@/lib/api-response";

/**
 * DEPRECADO. Antes marcaba un flag falso (`academies.paymentsConfiguredAt`) sin
 * configurar ningun gateway real. Los cobros a familias se habilitan ahora
 * conectando Stripe Connect Standard en `POST /api/payments/connect/onboard`;
 * el flag y el checklist de onboarding se marcan solo cuando Stripe habilita
 * cobros de verdad (webhook account.updated / refresh).
 */
export const POST = withTenant(async () =>
  apiError(
    "DEPRECATED_PAYMENTS_CONFIGURE",
    "Este endpoint esta deprecado. Conecta Stripe en /api/payments/connect/onboard.",
    410
  ) as NextResponse
);

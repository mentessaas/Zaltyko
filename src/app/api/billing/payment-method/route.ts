import { apiError } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// Handler for POST - separated to apply rate limiting
const updatePaymentMethodHandler = withTenant(async (req, context) => {
    try {
        void req;
        void context;
        return apiError("USE_BILLING_PORTAL", "Gestiona el método de pago desde el portal de facturación.", 410);
    } catch (error) {
        logger.error("Error updating payment method:", error);
        return apiError("INTERNAL_ERROR", "Internal Server Error", 500);
    }
});

// Rate-limited POST handler: 10 requests per minute
export const POST = withRateLimit(
    async (request, context) => {
        return (await updatePaymentMethodHandler(request, context)) as NextResponse;
    },
    { identifier: getUserIdentifier, limit: 10, window: 60 }
);

// Handler for GET - separated to apply rate limiting
const getPaymentMethodHandler = withTenant(async (req, context) => {
    try {
        void req;
        void context;
        return apiError("USE_BILLING_PORTAL", "Gestiona el método de pago desde el portal de facturación.", 410);
    } catch (error) {
        logger.error("Error fetching payment method:", error);
        return apiError("INTERNAL_ERROR", "Internal Server Error", 500);
    }
});

// Rate-limited GET handler: 100 requests per minute
export const GET = withRateLimit(
    async (request, context) => {
        return (await getPaymentMethodHandler(request, context)) as NextResponse;
    },
    { identifier: getUserIdentifier, limit: 100, window: 60 }
);

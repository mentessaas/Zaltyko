import { NextResponse } from "next/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

// Export dynamic to prevent static generation
export const dynamic = "force-dynamic";

/**
 * @swagger
 * /api/rate-limit-test:
 *   get:
 *     summary: Test endpoint for rate limiting
 *     description: Returns a simple response to test rate limit functionality
 *     tags:
 *       - Testing
 *     responses:
 *       200:
 *         description: Success response
 *       429:
 *         description: Rate limit exceeded
 */
async function handler() {
    // Only allow in development
    if (process.env.NODE_ENV !== "development") {
        return NextResponse.json(
            { error: "This endpoint is only available in development mode" },
            { status: 403 }
        );
    }

    return NextResponse.json({
        success: true,
        message: "Rate limit test successful",
        timestamp: new Date().toISOString(),
    });
}

// Apply rate limiting with strict limits for testing
export const GET = withRateLimit(handler, {
    limit: RATE_LIMITS.STRICT.limit,
    window: RATE_LIMITS.STRICT.window,
});

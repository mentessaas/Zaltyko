import { kv } from "@vercel/kv";
import { NextRequest, NextResponse } from "next/server";

/**
 * Rate Limiting using Vercel KV (Redis)
 * 
 * Implements sliding window rate limiting for production use.
 */

export interface RateLimitConfig {
  /**
   * Unique identifier for the rate limit (e.g., IP address, user ID)
   */
  identifier: string;

  /**
   * Maximum number of requests allowed in the time window
   */
  limit: number;

  /**
   * Time window in seconds
   */
  window: number;
}

export interface RateLimitResult {
  /**
   * Whether the request is allowed
   */
  success: boolean;

  /**
   * Maximum number of requests allowed
   */
  limit: number;

  /**
   * Number of requests remaining in the current window
   */
  remaining: number;

  /**
   * Unix timestamp when the rate limit resets
   */
  reset: number;
}

/**
 * Implements sliding window rate limiting using Redis (Vercel KV)
 * 
 * @param config - Rate limit configuration
 * @returns Rate limit result with success status and metadata
 */
export async function rateLimit(config: RateLimitConfig): Promise<RateLimitResult> {
  const { identifier, limit, window } = config;

  // Create a unique key for this identifier
  const key = `rate_limit:${identifier}`;

  // Get current timestamp in seconds
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - window;

  try {
    // Use Redis sorted set to track requests with timestamps
    // Remove old requests outside the current window
    await kv.zremrangebyscore(key, 0, windowStart);

    // Count requests in the current window
    const requestCount = await kv.zcard(key);

    // Check if limit is exceeded
    if (requestCount >= limit) {
      // Get the oldest request timestamp to calculate reset time
      const oldestRequests = await kv.zrange(key, 0, 0, { withScores: true });
      const oldestTimestamp = oldestRequests.length > 0
        ? (oldestRequests[1] as number)
        : now;

      const reset = Math.ceil(oldestTimestamp + window);

      return {
        success: false,
        limit,
        remaining: 0,
        reset,
      };
    }

    // Add current request to the sorted set
    await kv.zadd(key, { score: now, member: `${now}:${Math.random()}` });

    // Set expiration on the key to clean up automatically
    await kv.expire(key, window);

    // Calculate remaining requests
    const remaining = limit - (requestCount + 1);
    const reset = now + window;

    return {
      success: true,
      limit,
      remaining,
      reset,
    };
  } catch (error) {
    console.error("Rate limit error:", error);

    // On error, allow the request but log the issue
    // This prevents rate limiting from breaking the app if Redis is down
    return {
      success: true,
      limit,
      remaining: limit,
      reset: now + window,
    };
  }
}

/**
 * Rate limit presets for different endpoint types
 */
export const RATE_LIMITS = {
  /**
   * Public endpoints (100 requests per minute)
   */
  PUBLIC: {
    limit: 100,
    window: 60,
  },

  /**
   * Authenticated endpoints (300 requests per minute)
   */
  AUTHENTICATED: {
    limit: 300,
    window: 60,
  },

  /**
   * Critical endpoints like billing and webhooks (10 requests per minute)
   */
  CRITICAL: {
    limit: 10,
    window: 60,
  },

  /**
   * Strict rate limit for sensitive operations (5 requests per minute)
   */
  STRICT: {
    limit: 5,
    window: 60,
  },

  /**
   * Webhooks - high limit for external services
   */
  WEBHOOK: {
    limit: 1000,
    window: 60,
  },
} as const;

/**
 * Route-specific rate limits
 */
const ROUTE_LIMITS: Record<string, { limit: number; window: number }> = {
  // Super Admin - moderate limits
  "/api/super-admin": { limit: 50, window: 60 },

  // Billing - restrictive (sensitive operations)
  "/api/billing/checkout": { limit: 10, window: 60 },
  "/api/billing/portal": { limit: 10, window: 60 },

  // Users and auth - moderate limits
  "/api/admin/users": { limit: 20, window: 60 },
  "/api/invitations": { limit: 20, window: 60 },

  // Write operations - more restrictive
  "/api/athletes": { limit: 60, window: 60 },
  "/api/assessments": { limit: 30, window: 60 },
  "/api/classes": { limit: 30, window: 60 },
  "/api/coaches": { limit: 30, window: 60 },
  "/api/groups": { limit: 30, window: 60 },
  "/api/attendance": { limit: 60, window: 60 },
  "/api/class-sessions": { limit: 30, window: 60 },
  "/api/academies": { limit: 10, window: 60 },

  // Import - very restrictive
  "/api/athletes/import": { limit: 5, window: 60 },

  // Webhooks - no limits (called by external services)
  "/api/stripe/webhook": { limit: 1000, window: 60 },
  "/api/lemonsqueezy/webhook": { limit: 1000, window: 60 },

  // Public forms - restrictive to prevent spam
  "/api/public/academies": { limit: 5, window: 60 },
};

/**
 * Gets the rate limit for a specific route
 */
export function getLimitForRoute(pathname: string): { limit: number; window: number } {
  for (const [route, limits] of Object.entries(ROUTE_LIMITS)) {
    if (pathname.startsWith(route)) {
      return limits;
    }
  }
  return { limit: 100, window: 60 }; // Default: 100 req/min
}

/**
 * Helper function to get client identifier from request
 * Uses user ID if authenticated, otherwise falls back to IP address
 */
export function getClientIdentifier(request: NextRequest, userId?: string): string {
  if (userId) {
    return `user:${userId}`;
  }

  // Try to get IP from various headers (Vercel, Cloudflare, etc.)
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0] || realIp || "unknown";

  return `ip:${ip}`;
}

/**
 * Helper to get user identifier from request headers
 */
export function getUserIdentifier(request: NextRequest): string {
  const userId = request.headers.get("x-user-id");
  if (userId) {
    return `user:${userId}`;
  }

  return getClientIdentifier(request);
}

/**
 * Middleware wrapper for rate limiting
 */
export function withRateLimit(
  handler: (request: NextRequest, context?: any) => Promise<Response | NextResponse>,
  options?: {
    identifier?: (request: NextRequest) => string;
    limit?: number;
    window?: number;
  }
) {
  return async (request: NextRequest, context?: any): Promise<Response | NextResponse> => {
    const pathname = new URL(request.url).pathname;

    // Get identifier (IP or user ID)
    const identifier = options?.identifier
      ? options.identifier(request)
      : getClientIdentifier(request);

    // Get limits for this route
    const routeLimits = options?.limit && options?.window
      ? { limit: options.limit, window: options.window }
      : getLimitForRoute(pathname);

    // Check rate limit
    const result = await rateLimit({
      identifier: `${pathname}:${identifier}`,
      ...routeLimits,
    });

    if (!result.success) {
      const resetSeconds = result.reset - Math.floor(Date.now() / 1000);
      return NextResponse.json(
        {
          error: "RATE_LIMIT_EXCEEDED",
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

    // Execute handler
    try {
      const response = await handler(request, context);

      // Add rate limit headers
      response.headers.set("X-RateLimit-Limit", String(result.limit));
      response.headers.set("X-RateLimit-Remaining", String(result.remaining));
      response.headers.set("X-RateLimit-Reset", String(result.reset));

      return response;
    } catch (error) {
      const errorResponse = error instanceof Error
        ? NextResponse.json(
          {
            error: "INTERNAL_ERROR",
            message: error.message,
          },
          { status: 500 }
        )
        : NextResponse.json(
          {
            error: "INTERNAL_ERROR",
            message: "Ha ocurrido un error desconocido",
          },
          { status: 500 }
        );

      // Add rate limit headers even on errors
      errorResponse.headers.set("X-RateLimit-Limit", String(result.limit));
      errorResponse.headers.set("X-RateLimit-Remaining", String(result.remaining));
      errorResponse.headers.set("X-RateLimit-Reset", String(result.reset));

      return errorResponse;
    }
  };
}

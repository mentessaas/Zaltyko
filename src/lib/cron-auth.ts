import { createHash, timingSafeEqual } from "node:crypto";

import { apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

function securelyMatches(value: string | null, expected: string): boolean {
  // Hashing first keeps both buffers at a fixed length, so timingSafeEqual can
  // be used even when the received Authorization header has another length.
  const valueHash = createHash("sha256")
    .update(value ?? "")
    .digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(valueHash, expectedHash);
}

export function requireCronAuth(request: Request): Response | null {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    logger.error("CRON_SECRET is not configured");
    return apiError(
      "CRON_NOT_CONFIGURED",
      "Cron authentication is not configured",
      503
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!securelyMatches(authHeader, `Bearer ${cronSecret}`)) {
    return apiError("UNAUTHORIZED", "No autorizado", 401);
  }

  return null;
}

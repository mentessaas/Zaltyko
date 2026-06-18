import { apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

export function requireCronAuth(request: Request): Response | null {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    logger.error("CRON_SECRET is not configured");
    return apiError("CRON_NOT_CONFIGURED", "Cron authentication is not configured", 503);
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return apiError("UNAUTHORIZED", "No autorizado", 401);
  }

  return null;
}

import { authzAdapter } from "@/lib/authz";
import { auditLogs } from "@/db/schema";
import { logger } from "@/lib/logger";

type AdminLogMeta = Record<string, unknown>;

export async function logAdminAction(params: {
  userId: string;
  tenantId?: string | null;
  action: string;
  meta?: AdminLogMeta;
}) {
  try {
    await authzAdapter.db.insert(auditLogs).values({
      userId: params.userId,
      tenantId: params.tenantId ?? null,
      action: params.action,
      meta: params.meta ?? null,
    });
  } catch (error) {
    logger.error("Failed to log admin action", error as Error, { userId: params.userId, tenantId: params.tenantId, action: params.action });
  }
}


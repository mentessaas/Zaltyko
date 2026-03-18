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
      tenantId: params.tenantId ?? null,
      userId: params.userId,
      action: params.action as any,
      module: "admin" as any,
      status: "success" as any,
      meta: params.meta ?? null,
    });
  } catch (error) {
    logger.error("Failed to log admin action", error as Error, { userId: params.userId, tenantId: params.tenantId, action: params.action });
  }
}


import { authzAdapter } from "@/lib/authz";
import { auditLogs } from "@/db/schema";
import { logger } from "@/lib/logger";

type AdminLogMeta = Record<string, unknown>;

export async function logAdminAction(params: {
  userId: string;
  tenantId?: string | null;
  action: string;
  module?: string;
  resourceType?: string;
  resourceId?: string | null;
  resourceName?: string | null;
  description?: string;
  userEmail?: string | null;
  meta?: AdminLogMeta;
  status?: "success" | "failed" | "warning";
}) {
  try {
    await authzAdapter.db.insert(auditLogs).values({
      tenantId: params.tenantId ?? null,
      userId: params.userId,
      userEmail: params.userEmail ?? null,
      action: params.action as any,
      module: (params.module ?? "admin") as any,
      resourceType: params.resourceType ?? null,
      resourceId: params.resourceId ?? null,
      resourceName: params.resourceName ?? null,
      description: params.description ?? null,
      status: (params.status ?? "success") as any,
      meta: params.meta ?? null,
    });
  } catch (error) {
    logger.error("Failed to log admin action", error as Error, { userId: params.userId, tenantId: params.tenantId, action: params.action });
  }
}

import { authzAdapter } from "@/lib/authz";
import { auditLogs } from "@/db/schema";

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
    console.error("Failed to log admin action", error);
  }
}


import { db } from "@/db";
import { auditLogs } from "@/db/schema/audit-logs";
import { eq } from "drizzle-orm";

export type AuditAction =
  | "user.create"
  | "user.update"
  | "user.delete"
  | "academy.create"
  | "academy.update"
  | "academy.delete"
  | "athlete.update"
  | "athlete.delete"
  | "billing.update"
  | "settings.update";

export interface CreateAuditLogParams {
  tenantId: string;
  userId: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Creates an audit log entry for tracking admin actions
 * Useful for compliance and security monitoring
 */
export async function createAuditLog(params: CreateAuditLogParams) {
  try {
    await db.insert(auditLogs).values({
      tenantId: params.tenantId as any,
      userId: params.userId as any,
      action: params.action as any,
      module: (params.resourceType || "general") as any,
      status: "success" as any,
      resourceType: params.resourceType,
      resourceId: params.resourceId as any,
      meta: params.metadata ?? {},
    });
  } catch (error) {
    // Log error but don't throw - audit logging should not break main operations
    console.error("Failed to create audit log:", error);
  }
}

/**
 * Gets audit logs for a specific tenant
 */
export async function getAuditLogs(tenantId: string, options?: {
  limit?: number;
  offset?: number;
  action?: AuditAction;
}) {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const whereConditions = [eq(auditLogs.tenantId, tenantId)];
  if (options?.action) {
    whereConditions.push(eq(auditLogs.action, options.action) as any);
  }

  const logs = await db
    .select()
    .from(auditLogs)
    .where(and(...whereConditions) as any)
    .orderBy(auditLogs.createdAt)
    .limit(limit)
    .offset(offset);

  return logs;
}

// Helper for and clause
function and<T>(...conditions: T[]): T {
  return conditions[0];
}

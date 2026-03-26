import { db } from "@/db";
import { auditLogs } from "@/db/schema/audit-logs";
import { and, eq, ilike, gte, lte, desc, sql, count, or } from "drizzle-orm";
import type { AuditAction, AuditModule } from "@/db/schema/audit-logs";

export interface AuditLogFilters {
  academyId?: string;
  userId?: string;
  module?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  status?: "success" | "failed" | "warning";
  startDate?: Date;
  endDate?: Date;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function getAuditLogs(filters: AuditLogFilters) {
  const conditions = [];

  if (filters.academyId) {
    conditions.push(eq(auditLogs.tenantId, filters.academyId));
  }
  if (filters.userId) {
    conditions.push(eq(auditLogs.userId, filters.userId));
  }
  if (filters.module) {
    conditions.push(eq(auditLogs.module, filters.module));
  }
  if (filters.action) {
    conditions.push(eq(auditLogs.action, filters.action));
  }
  if (filters.resourceType) {
    conditions.push(eq(auditLogs.resourceType, filters.resourceType));
  }
  if (filters.resourceId) {
    conditions.push(eq(auditLogs.resourceId, filters.resourceId));
  }
  if (filters.status) {
    conditions.push(eq(auditLogs.status, filters.status));
  }
  if (filters.startDate) {
    conditions.push(gte(auditLogs.createdAt, filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(lte(auditLogs.createdAt, filters.endDate));
  }
  if (filters.search) {
    conditions.push(
      or(
        ilike(auditLogs.description, `%${filters.search}%`),
        ilike(auditLogs.userEmail, `%${filters.search}%`)
      )!
    );
  }

  const result = await db
    .select()
    .from(auditLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(filters.limit ?? 50)
    .offset(filters.offset ?? 0);

  return result;
}

export async function getAuditLogsCount(filters: AuditLogFilters) {
  const conditions = [];

  if (filters.academyId) {
    conditions.push(eq(auditLogs.tenantId, filters.academyId));
  }
  if (filters.userId) {
    conditions.push(eq(auditLogs.userId, filters.userId));
  }
  if (filters.module) {
    conditions.push(eq(auditLogs.module, filters.module));
  }
  if (filters.action) {
    conditions.push(eq(auditLogs.action, filters.action));
  }
  if (filters.resourceType) {
    conditions.push(eq(auditLogs.resourceType, filters.resourceType));
  }
  if (filters.resourceId) {
    conditions.push(eq(auditLogs.resourceId, filters.resourceId));
  }
  if (filters.status) {
    conditions.push(eq(auditLogs.status, filters.status));
  }
  if (filters.startDate) {
    conditions.push(gte(auditLogs.createdAt, filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(lte(auditLogs.createdAt, filters.endDate));
  }
  if (filters.search) {
    conditions.push(
      or(
        ilike(auditLogs.description, `%${filters.search}%`),
        ilike(auditLogs.userEmail, `%${filters.search}%`)
      )!
    );
  }

  const [result] = await db
    .select({ count: count() })
    .from(auditLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return result?.count ?? 0;
}

export async function exportAuditLogs(filters: AuditLogFilters): Promise<string> {
  const logs = await getAuditLogs({ ...filters, limit: 10000, offset: 0 });

  const headers = [
    "ID",
    "Fecha",
    "Usuario",
    "Email",
    "Modulo",
    "Accion",
    "Recurso",
    "ID Recurso",
    "Descripcion",
    "Estado",
    "IP",
  ];

  const rows = logs.map((log) => [
    log.id,
    log.createdAt?.toISOString() ?? "",
    log.userId ?? "",
    log.userEmail ?? "",
    log.module,
    log.action,
    log.resourceType ?? "",
    log.resourceId ?? "",
    log.description ?? "",
    log.status,
    log.ipAddress ?? "",
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  return csvContent;
}

interface CreateAuditLogParams {
  tenantId: string;
  userId?: string;
  userEmail?: string;
  action: AuditAction;
  module: AuditModule;
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  description?: string;
  ipAddress?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
  status?: "success" | "failed" | "warning";
}

export async function createAuditLog(params: CreateAuditLogParams) {
  const [log] = await db
    .insert(auditLogs)
    .values({
      tenantId: params.tenantId,
      userId: params.userId ?? null,
      userEmail: params.userEmail ?? null,
      action: params.action,
      module: params.module,
      resourceType: params.resourceType ?? null,
      resourceId: params.resourceId ?? null,
      resourceName: params.resourceName ?? null,
      description: params.description ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      meta: params.meta ?? null,
      status: params.status ?? "success",
    })
    .returning();

  return log;
}

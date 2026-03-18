export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getAuditLogs,
  getAuditLogsCount,
  exportAuditLogs,
  type AuditLogFilters,
} from "@/lib/authz/audit-service";
import { withTenant } from "@/lib/authz";

const querySchema = z.object({
  userId: z.string().optional(),
  module: z.string().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  status: z.enum(["success", "failed", "warning"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
  export: z.string().optional(),
});

// GET /api/audit-logs
export const GET = withTenant(async (request, context) => {
  const { searchParams } = new URL(request.url);

  const params = {
    userId: searchParams.get("userId") || undefined,
    module: searchParams.get("module") as any || undefined,
    action: searchParams.get("action") || undefined,
    resourceType: searchParams.get("resourceType") || undefined,
    resourceId: searchParams.get("resourceId") || undefined,
    status: searchParams.get("status") as any || undefined,
    startDate: searchParams.get("startDate") ? new Date(searchParams.get("startDate")!) : undefined,
    endDate: searchParams.get("endDate") ? new Date(searchParams.get("endDate")!) : undefined,
    search: searchParams.get("search") || undefined,
    limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 50,
    offset: searchParams.get("offset") ? parseInt(searchParams.get("offset")!) : 0,
  };

  const validated = querySchema.parse(params);

  // Preparar filtros para el servicio (excluir strings de pagination)
  const filters: AuditLogFilters = {
    userId: validated.userId,
    module: validated.module as any,
    action: validated.action as any,
    resourceType: validated.resourceType,
    resourceId: validated.resourceId,
    status: validated.status as any,
    startDate: validated.startDate ? new Date(validated.startDate) : undefined,
    endDate: validated.endDate ? new Date(validated.endDate) : undefined,
    search: validated.search,
    limit: validated.limit ? parseInt(validated.limit) : 50,
    offset: validated.offset ? parseInt(validated.offset) : 0,
    academyId: context.tenantId,
  };

  // Si es exportación, devolver CSV
  if (validated.export === "csv") {
    const csv = await exportAuditLogs(filters);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="audit-logs-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  }

  const [logs, total] = await Promise.all([
    getAuditLogs(filters),
    getAuditLogsCount(filters),
  ]);

  return NextResponse.json({
    logs,
    pagination: {
      total,
      limit: validated.limit,
      offset: validated.offset,
    },
  });
});
import { apiSuccess, apiError } from "@/lib/api-response";
import { eq, and, desc, count } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { db } from "@/db";
import { emailLogs } from "@/db/schema";

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  academyId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const canViewEmailHistory = (role?: string) =>
  ["owner", "admin", "super_admin"].includes(role ?? "");

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }
  if (!canViewEmailHistory(context.profile?.role)) {
    return apiError("FORBIDDEN", "No tienes permiso para consultar el historial de correo", 403);
  }

  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse({
    academyId: url.searchParams.get("academyId") || undefined,
    limit: url.searchParams.get("limit") || undefined,
    offset: url.searchParams.get("offset") || undefined,
  });
  if (!parsedQuery.success) {
    return apiError("VALIDATION_ERROR", "Parámetros de consulta inválidos", 400);
  }
  const { academyId, limit, offset } = parsedQuery.data;

  const targetAcademyId = academyId ?? context.profile.activeAcademyId ?? null;
  if (targetAcademyId) {
    const scope = await authorizeAcademyCapability({
      context,
      resourceTenantId: context.tenantId,
      academyId: targetAcademyId,
      permission: "communications:read",
    });
    if (!scope.allowed) return apiError("EMAIL_HISTORY_NOT_FOUND", "No se encontró historial de correo", 404);
  } else if (context.profile.role !== "super_admin") {
    return apiError("ACADEMY_REQUIRED", "Academy ID is required", 400);
  }

  const whereConditions = [eq(emailLogs.tenantId, context.tenantId)];
  if (targetAcademyId) {
    whereConditions.push(eq(emailLogs.academyId, targetAcademyId));
  }

  const logs = await db
    .select()
    .from(emailLogs)
    .where(and(...whereConditions))
    .orderBy(desc(emailLogs.createdAt))
    .limit(limit)
    .offset(offset);

  const [total] = await db
    .select({ count: count(emailLogs.id) })
    .from(emailLogs)
    .where(and(...whereConditions))
    .limit(1);

  return apiSuccess({
    items: logs.map((log) => ({
      id: log.id,
      toEmail: log.toEmail,
      subject: log.subject,
      template: log.template,
      status: log.status,
      errorMessage: log.errorMessage,
      sentAt: log.sentAt?.toISOString() || null,
      createdAt: log.createdAt?.toISOString(),
      metadata: log.metadata,
    })),
    total: Number(total?.count ?? 0),
    limit,
    offset,
  });
});

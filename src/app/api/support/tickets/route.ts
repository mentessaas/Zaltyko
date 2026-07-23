import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { profiles, tickets } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { apiCreated, apiError, apiSuccess } from "@/lib/api-response";
import { verifyAcademyAccessForProfile } from "@/lib/permissions";

const ticketSchema = z.object({
  title: z.string().trim().min(3).max(255),
  description: z.string().trim().min(10).max(10_000),
  category: z.enum(["technical", "billing", "account", "feature_request", "other"]),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  academyId: z.string().uuid().optional(),
});

const querySchema = z.object({
  academyId: z.string().uuid().optional(),
  status: z.enum(["open", "in_progress", "waiting", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  category: z.enum(["technical", "billing", "account", "feature_request", "other"]).optional(),
});

export const GET = withTenant(async (request, context) => {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("INVALID_QUERY", "Filtros de soporte inválidos", 400);

  const academyId = parsed.data.academyId ?? context.profile.activeAcademyId ?? undefined;
  if (academyId && context.profile.role !== "super_admin") {
    const access = await verifyAcademyAccessForProfile({
      academyId,
      tenantId: context.tenantId,
      profile: context.profile,
    });
    if (!access.allowed) return apiError("ACADEMY_ACCESS_DENIED", "No tienes acceso a esta academia", 403);
  }

  const filters = [
    academyId ? eq(tickets.academyId, academyId) : undefined,
    parsed.data.status ? eq(tickets.status, parsed.data.status) : undefined,
    parsed.data.priority ? eq(tickets.priority, parsed.data.priority) : undefined,
    parsed.data.category ? eq(tickets.category, parsed.data.category) : undefined,
  ].filter(Boolean) as Array<ReturnType<typeof eq>>;

  if (context.profile.role !== "super_admin" && !academyId) {
    filters.push(eq(tickets.createdBy, context.profile.id));
  }

  const rows = await db
    .select({
      id: tickets.id,
      title: tickets.title,
      description: tickets.description,
      status: tickets.status,
      priority: tickets.priority,
      category: tickets.category,
      academyId: tickets.academyId,
      createdBy: tickets.createdBy,
      assignedTo: tickets.assignedTo,
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
      resolvedAt: tickets.resolvedAt,
      closedAt: tickets.closedAt,
      creatorName: profiles.name,
    })
    .from(tickets)
    .leftJoin(profiles, eq(tickets.createdBy, profiles.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(tickets.createdAt));

  return apiSuccess(rows, { total: rows.length });
});

export const POST = withTenant(async (request, context) => {
  const parsed = ticketSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Datos de ticket inválidos", 400);

  const academyId = parsed.data.academyId ?? context.profile.activeAcademyId ?? null;
  if (academyId && context.profile.role !== "super_admin") {
    const access = await verifyAcademyAccessForProfile({
      academyId,
      tenantId: context.tenantId,
      profile: context.profile,
    });
    if (!access.allowed) return apiError("ACADEMY_ACCESS_DENIED", "No tienes acceso a esta academia", 403);
  }

  const [ticket] = await db
    .insert(tickets)
    .values({
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      priority: parsed.data.priority,
      academyId,
      createdBy: context.profile.id,
    })
    .returning();

  return apiCreated(ticket);
});

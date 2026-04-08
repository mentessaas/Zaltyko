export const dynamic = 'force-dynamic';

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athletes, guardians, guardianAthletes } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { apiSuccess, apiError, apiCreated } from "@/lib/api-response";

const GuardianSchema = z.object({
  athleteId: z.string().uuid().optional(),
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  relationship: z.string().optional(),
  notifyEmail: z.boolean().optional(),
  notifySms: z.boolean().optional(),
});

const CreateBodySchema = z.object({
  academyId: z.string().uuid(),
  guardian: GuardianSchema,
  athleteIds: z.array(z.string().uuid()).optional(),
});

const filterSchema = z.object({
  athleteId: z.string().uuid().optional(),
  academyId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const GET = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    const filters = filterSchema.safeParse(Object.fromEntries(url.searchParams));

    if (!filters.success) {
      return handleApiError(filters.error);
    }

    const { athleteId, academyId, page = 1, limit = 50 } = filters.data;

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant context is required", 400);
    }

    const pageSize = Math.min(200, Math.max(1, limit));
    const offset = (page - 1) * pageSize;

    // Build conditions
    const conditions = [sql`${guardians.tenantId} = ${context.tenantId}`];

    if (athleteId) {
      // Get guardian IDs associated with this athlete
      const guardianIds = await db
        .select({ guardianId: guardianAthletes.guardianId })
        .from(guardianAthletes)
        .where(eq(guardianAthletes.athleteId, athleteId));

      const ids = guardianIds.map(g => g.guardianId).filter(Boolean);
      if (ids.length > 0) {
        conditions.push(sql`${guardians.id} = ANY(${ids})`);
      } else {
        // No guardians found for this athlete
        return apiSuccess([], { total: 0, page, pageSize });
      }
    }

    const whereClause = and(...conditions);

    // Get total count
    const countResult = await db
      .select({ value: sql<number>`count(*)` })
      .from(guardians)
      .where(whereClause);

    const total = Number(countResult?.[0]?.value ?? 0);

    // Get guardians with their athlete relationships
    const items = await db
      .select({
        id: guardians.id,
        name: guardians.name,
        email: guardians.email,
        phone: guardians.phone,
        relationship: guardians.relationship,
        notifyEmail: guardians.notifyEmail,
        notifySms: guardians.notifySms,
        profileId: guardians.profileId,
        createdAt: guardians.createdAt,
      })
      .from(guardians)
      .where(whereClause)
      .orderBy(asc(guardians.name))
      .limit(pageSize)
      .offset(offset);

    // Get athlete associations for each guardian
    const guardianIds = items.map(g => g.id);
    const athleteAssociations: Record<string, Array<{ athleteId: string; athleteName: string; relationship: string | null; isPrimary: boolean }>> = {};

    if (guardianIds.length > 0) {
      const associations = await db
        .select({
          guardianId: guardianAthletes.guardianId,
          athleteId: guardianAthletes.athleteId,
          relationship: guardianAthletes.relationship,
          isPrimary: guardianAthletes.isPrimary,
          athleteName: athletes.name,
        })
        .from(guardianAthletes)
        .leftJoin(athletes, eq(guardianAthletes.athleteId, athletes.id))
        .where(sql`${guardianAthletes.guardianId} = ANY(${guardianIds})`);

      for (const assoc of associations) {
        if (!athleteAssociations[assoc.guardianId]) {
          athleteAssociations[assoc.guardianId] = [];
        }
        if (assoc.athleteId) {
          athleteAssociations[assoc.guardianId].push({
            athleteId: assoc.athleteId,
            athleteName: assoc.athleteName ?? "Unknown",
            relationship: assoc.relationship,
            isPrimary: assoc.isPrimary ?? false,
          });
        }
      }
    }

    const itemsWithAthletes = items.map(g => ({
      ...g,
      athletes: athleteAssociations[g.id] ?? [],
    }));

    const totalPages = Math.ceil(total / pageSize);

    return apiSuccess(itemsWithAthletes, { total, page, pageSize });
  } catch (error) {
    return handleApiError(error);
  }
});

export const POST = withTenant(async (request, context) => {
  try {
    const body = CreateBodySchema.parse(await request.json());

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant context is required", 400);
    }

    const guardianId = crypto.randomUUID();

    // Create guardian
    await db.insert(guardians).values({
      id: guardianId,
      tenantId: context.tenantId,
      name: body.guardian.name,
      email: body.guardian.email || null,
      phone: body.guardian.phone || null,
      relationship: body.guardian.relationship || null,
      notifyEmail: body.guardian.notifyEmail ?? true,
      notifySms: body.guardian.notifySms ?? false,
    });

    // Associate with athletes if provided
    if (body.athleteIds?.length) {
      const associations = body.athleteIds.map(athleteId => ({
        id: crypto.randomUUID(),
        tenantId: context.tenantId,
        guardianId,
        athleteId,
        relationship: body.guardian.relationship || null,
        isPrimary: false,
      }));

      await db.insert(guardianAthletes).values(associations).onConflictDoNothing();
    }

    return apiCreated({ id: guardianId });
  } catch (error) {
    return handleApiError(error);
  }
});

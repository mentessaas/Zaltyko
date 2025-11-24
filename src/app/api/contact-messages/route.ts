import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";

import { db } from "@/db";
import { contactMessages, academies } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { verifyAcademyAccess } from "@/lib/permissions";

const querySchema = z.object({
  academyId: z.string().uuid(),
  read: z.string().optional(),
  archived: z.string().optional(),
  limit: z.string().optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const params = {
    academyId: url.searchParams.get("academyId"),
    read: url.searchParams.get("read"),
    archived: url.searchParams.get("archived"),
    limit: url.searchParams.get("limit"),
  };

  const validated = querySchema.parse(params);

  // Verificar acceso a la academia
  const academyAccess = await verifyAcademyAccess(validated.academyId, context.tenantId);
  if (!academyAccess.allowed) {
    return NextResponse.json(
      { error: academyAccess.reason ?? "ACADEMY_NOT_FOUND" },
      { status: 403 }
    );
  }

  // Verificar que el usuario es propietario o admin de la academia
  const [academy] = await db
    .select({
      ownerId: academies.ownerId,
    })
    .from(academies)
    .where(eq(academies.id, validated.academyId))
    .limit(1);

  if (!academy) {
    return NextResponse.json({ error: "ACADEMY_NOT_FOUND" }, { status: 404 });
  }

  const isAdmin = context.profile.role === "admin" || context.profile.role === "super_admin";
  const isOwner = academy.ownerId === context.profile.id;

  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Construir condiciones de filtro
  const whereConditions = [eq(contactMessages.academyId, validated.academyId)];

  if (validated.read === "true") {
    whereConditions.push(eq(contactMessages.read, true));
  } else if (validated.read === "false") {
    whereConditions.push(eq(contactMessages.read, false));
  }

  if (validated.archived === "true") {
    whereConditions.push(eq(contactMessages.archived, true));
  } else if (validated.archived === "false") {
    whereConditions.push(eq(contactMessages.archived, false));
  }

  // Construir query
  let query = db
    .select()
    .from(contactMessages)
    .where(and(...whereConditions))
    .orderBy(desc(contactMessages.createdAt));

  if (validated.limit) {
    const limit = parseInt(validated.limit);
    if (limit > 0 && limit <= 100) {
      query = query.limit(limit) as typeof query;
    }
  }

  const messages = await query;

  return NextResponse.json({
    items: messages.map((m) => ({
      id: m.id,
      academyId: m.academyId,
      contactName: m.contactName,
      contactEmail: m.contactEmail,
      contactPhone: m.contactPhone,
      message: m.message,
      read: m.read,
      readAt: m.readAt?.toISOString() || null,
      responded: m.responded,
      respondedAt: m.respondedAt?.toISOString() || null,
      archived: m.archived,
      createdAt: m.createdAt?.toISOString() || null,
    })),
  });
});


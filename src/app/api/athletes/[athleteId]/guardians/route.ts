import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athletes, familyContacts, guardianAthletes, guardians } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { apiSuccess, apiError } from "@/lib/api-response";
import { NextResponse } from "next/server";

const GuardianBodySchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  relationship: z.string().optional(),
  notifyEmail: z.boolean().optional(),
  notifySms: z.boolean().optional(),
  isPrimary: z.boolean().optional(),
});

async function ensureAthleteTenant(athleteId: string) {
  const [row] = await db
    .select({
      id: athletes.id,
      tenantId: athletes.tenantId,
      academyId: athletes.academyId,
    })
    .from(athletes)
    .where(and(eq(athletes.id, athleteId), isNull(athletes.deletedAt)))
    .limit(1);

  return row ?? null;
}

// Handler for GET - separated to apply rate limiting
const getGuardiansHandler = withTenant(async (_request, context) => {
  const { athleteId } = (context.params ?? {}) as { athleteId?: string };

  if (!athleteId) {
    return apiError("ATHLETE_ID_REQUIRED", "Athlete ID is required", 400);
  }

  const athleteRow = await ensureAthleteTenant(athleteId);

  if (!athleteRow) {
    return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
  }

  const scope = await authorizeAcademyCapability({
    context,
    resourceTenantId: athleteRow.tenantId,
    academyId: athleteRow.academyId,
    permission: "athletes:read",
  });

  if (!scope.allowed) {
    return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
  }

  // Obtener contactos de guardian_athletes (sistema nuevo)
  const guardianRows = await db
    .select({
      linkId: guardianAthletes.id,
      guardianId: guardians.id,
      profileId: guardians.profileId,
      name: guardians.name,
      email: guardians.email,
      phone: guardians.phone,
      relationship: guardians.relationship,
      notifyEmail: guardians.notifyEmail,
      notifySms: guardians.notifySms,
      isPrimary: guardianAthletes.isPrimary,
      linkRelationship: guardianAthletes.relationship,
      createdAt: guardians.createdAt,
    })
    .from(guardianAthletes)
    .innerJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
    .where(and(
      eq(guardianAthletes.athleteId, athleteId),
      eq(guardianAthletes.tenantId, athleteRow.tenantId),
      eq(guardians.tenantId, athleteRow.tenantId),
    ))
    .limit(100);

  // Obtener contactos de family_contacts (sistema antiguo, para retrocompatibilidad)
  const familyContactRows = await db
    .select({
      id: familyContacts.id,
      name: familyContacts.name,
      email: familyContacts.email,
      phone: familyContacts.phone,
      relationship: familyContacts.relationship,
      notifyEmail: familyContacts.notifyEmail,
      notifySms: familyContacts.notifySms,
      createdAt: familyContacts.createdAt,
    })
    .from(familyContacts)
    .where(and(eq(familyContacts.athleteId, athleteId), eq(familyContacts.tenantId, athleteRow.tenantId)))
    .limit(100);

  // Combinar ambos tipos de contactos
  const allItems = [
    ...guardianRows.map((row) => ({
      linkId: row.linkId,
      guardianId: row.guardianId,
      profileId: row.profileId,
      name: row.name,
      email: row.email,
      phone: row.phone,
      relationship: row.relationship,
      notifyEmail: row.notifyEmail,
      notifySms: row.notifySms,
      isPrimary: row.isPrimary,
      linkRelationship: row.linkRelationship,
      createdAt: row.createdAt,
    })),
    ...familyContactRows.map((row) => ({
      linkId: row.id, // Usar el ID de family_contacts como linkId
      guardianId: null, // No hay guardianId en family_contacts
      profileId: null,
      name: row.name,
      email: row.email,
      phone: row.phone,
      relationship: row.relationship,
      notifyEmail: row.notifyEmail ?? true,
      notifySms: row.notifySms ?? false,
      isPrimary: false, // family_contacts no tiene isPrimary
      linkRelationship: row.relationship,
      createdAt: row.createdAt,
    })),
  ].sort((a, b) => {
    // Ordenar por fecha de creación
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateA - dateB;
  });

  return apiSuccess({ items: allItems });
});

// Rate-limited GET handler: 100 requests per minute
export const GET = withRateLimit(
  async (request, context) => {
    return (await getGuardiansHandler(request, context)) as NextResponse;
  },
  { identifier: getUserIdentifier, limit: 100, window: 60 }
);

// Handler for POST - separated to apply rate limiting
const createGuardianHandler = withTenant(async (request, context) => {
  const { athleteId } = (context.params ?? {}) as { athleteId?: string };

  if (!athleteId) {
    return apiError("ATHLETE_ID_REQUIRED", "Athlete ID is required", 400);
  }

  const athleteRow = await ensureAthleteTenant(athleteId);

  if (!athleteRow) {
    return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
  }

  const scope = await authorizeAcademyCapability({
    context,
    resourceTenantId: athleteRow.tenantId,
    academyId: athleteRow.academyId,
    permission: "athletes:create",
  });

  if (!scope.allowed) {
    return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
  }

  const body = GuardianBodySchema.parse(await request.json());

  const email = body.email?.toLowerCase();

  let guardianId: string | null = null;

  if (email) {
    const [existing] = await db
      .select({ id: guardians.id })
      .from(guardians)
      .where(and(eq(guardians.tenantId, athleteRow.tenantId), eq(guardians.email, email)))
      .limit(1);

    if (existing) {
      guardianId = existing.id;
      await db
        .update(guardians)
        .set({
          name: body.name,
          phone: body.phone ?? null,
          relationship: body.relationship ?? null,
          notifyEmail: body.notifyEmail ?? true,
          notifySms: body.notifySms ?? false,
        })
        .where(eq(guardians.id, existing.id));
    }
  }

  if (!guardianId) {
    guardianId = crypto.randomUUID();
    await db.insert(guardians).values({
      id: guardianId,
      tenantId: athleteRow.tenantId,
      name: body.name,
      email,
      phone: body.phone ?? null,
      relationship: body.relationship ?? null,
      notifyEmail: body.notifyEmail ?? true,
      notifySms: body.notifySms ?? false,
    });
  }

  const linkId = crypto.randomUUID();

  await db
    .insert(guardianAthletes)
    .values({
      id: linkId,
      tenantId: athleteRow.tenantId,
      guardianId,
      athleteId,
      relationship: body.relationship ?? null,
      isPrimary: body.isPrimary ?? false,
    })
    .onConflictDoNothing();

  const [guardianRow] = await db
    .select({
      linkId: guardianAthletes.id,
      guardianId: guardians.id,
      profileId: guardians.profileId,
      name: guardians.name,
      email: guardians.email,
      phone: guardians.phone,
      relationship: guardians.relationship,
      notifyEmail: guardians.notifyEmail,
      notifySms: guardians.notifySms,
      isPrimary: guardianAthletes.isPrimary,
      linkRelationship: guardianAthletes.relationship,
      createdAt: guardians.createdAt,
    })
    .from(guardianAthletes)
    .innerJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
    .where(and(
      eq(guardianAthletes.id, linkId),
      eq(guardianAthletes.tenantId, athleteRow.tenantId),
      eq(guardians.tenantId, athleteRow.tenantId),
    ))
    .limit(1);

  return apiSuccess({ item: guardianRow });
});

// Rate-limited POST handler: 10 requests per minute
export const POST = withRateLimit(
  async (request, context) => {
    return (await createGuardianHandler(request, context)) as NextResponse;
  },
  { identifier: getUserIdentifier, limit: 10, window: 60 }
);

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athletes, familyContacts, guardianAthletes, guardians } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { apiSuccess, apiError } from "@/lib/api-response";

const UpdateGuardianSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  relationship: z.string().optional(),
  notifyEmail: z.boolean().optional(),
  notifySms: z.boolean().optional(),
  isPrimary: z.boolean().optional(),
  linkRelationship: z.string().optional(),
});

async function getGuardianLink(linkId: string, athleteId: string): Promise<{
  linkId: string;
  guardianId: string | null;
  tenantId: string;
  athleteId: string;
} | null> {
  // Primero intentar buscar en guardian_athletes (sistema nuevo)
  const [guardianLink] = await db
    .select({
      linkId: guardianAthletes.id,
      guardianId: guardianAthletes.guardianId,
      tenantId: guardianAthletes.tenantId,
      athleteId: guardianAthletes.athleteId,
    })
    .from(guardianAthletes)
    .where(and(eq(guardianAthletes.id, linkId), eq(guardianAthletes.athleteId, athleteId)))
    .limit(1);

  if (guardianLink) {
    return guardianLink;
  }

  // Si no se encuentra, buscar en family_contacts (sistema antiguo)
  const [familyContact] = await db
    .select({
      linkId: familyContacts.id,
      guardianId: sql<string | null>`NULL::uuid`,
      tenantId: familyContacts.tenantId,
      athleteId: familyContacts.athleteId,
    })
    .from(familyContacts)
    .where(and(eq(familyContacts.id, linkId), eq(familyContacts.athleteId, athleteId)))
    .limit(1);

  return familyContact ?? null;
}

export const PATCH = withTenant(async (request, context) => {
  const { athleteId, linkId } = (context.params ?? {}) as { athleteId?: string; linkId?: string };

  if (!athleteId || !linkId) {
    return apiError("IDENTIFIERS_REQUIRED", "Athlete ID and Link ID are required", 400);
  }

  const link = await getGuardianLink(linkId, athleteId);

  if (!link) {
    return apiError("GUARDIAN_NOT_FOUND", "Guardian not found", 404);
  }

  const [athlete] = await db
    .select({ tenantId: athletes.tenantId, academyId: athletes.academyId })
    .from(athletes)
    .where(and(eq(athletes.id, athleteId), isNull(athletes.deletedAt)))
    .limit(1);

  if (!athlete || athlete.tenantId !== link.tenantId) {
    return apiError("GUARDIAN_NOT_FOUND", "Guardian not found", 404);
  }

  const scope = await authorizeAcademyCapability({
    context,
    resourceTenantId: athlete.tenantId,
    academyId: athlete.academyId,
    permission: "athletes:update",
  });

  if (!scope.allowed) {
    return apiError("FORBIDDEN", "Access denied", 403);
  }

  const body = UpdateGuardianSchema.parse(await request.json());

  if (Object.keys(body).length === 0) {
    return apiError("NO_CHANGES", "No changes provided", 400);
  }

  // Verificar si es de family_contacts (sistema antiguo) o guardian_athletes (sistema nuevo)
  const isFamilyContact = link.guardianId === null;

  if (isFamilyContact) {
    // Actualizar en family_contacts
    await db
      .update(familyContacts)
      .set({
        ...(body.name ? { name: body.name } : {}),
        ...(body.email ? { email: body.email.toLowerCase() } : {}),
        ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
        ...(body.relationship !== undefined ? { relationship: body.relationship ?? null } : {}),
        ...(body.notifyEmail !== undefined ? { notifyEmail: body.notifyEmail } : {}),
        ...(body.notifySms !== undefined ? { notifySms: body.notifySms } : {}),
      })
      .where(and(eq(familyContacts.id, linkId), eq(familyContacts.tenantId, link.tenantId), eq(familyContacts.athleteId, athleteId)));

    // Retornar el contacto actualizado
    const [updated] = await db
      .select({
        linkId: familyContacts.id,
        guardianId: sql<string | null>`NULL`,
        profileId: sql<string | null>`NULL`,
        name: familyContacts.name,
        email: familyContacts.email,
        phone: familyContacts.phone,
        relationship: familyContacts.relationship,
        notifyEmail: familyContacts.notifyEmail,
        notifySms: familyContacts.notifySms,
        isPrimary: sql<boolean>`false`,
        linkRelationship: familyContacts.relationship,
        createdAt: familyContacts.createdAt,
      })
      .from(familyContacts)
      .where(and(eq(familyContacts.id, linkId), eq(familyContacts.tenantId, link.tenantId), eq(familyContacts.athleteId, athleteId)))
      .limit(1);

    return apiSuccess({ item: updated });
  } else {
    // Actualizar en guardians y guardian_athletes (sistema nuevo)
    if (link.guardianId && (body.name || body.email || body.phone || body.relationship || body.notifyEmail !== undefined || body.notifySms !== undefined)) {
      await db
        .update(guardians)
        .set({
          ...(body.name ? { name: body.name } : {}),
          ...(body.email ? { email: body.email.toLowerCase() } : {}),
          ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
          ...(body.relationship !== undefined ? { relationship: body.relationship ?? null } : {}),
          ...(body.notifyEmail !== undefined ? { notifyEmail: body.notifyEmail } : {}),
          ...(body.notifySms !== undefined ? { notifySms: body.notifySms } : {}),
        })
        .where(and(eq(guardians.id, link.guardianId), eq(guardians.tenantId, link.tenantId)));
    }

    if (body.isPrimary !== undefined || body.linkRelationship !== undefined) {
      await db
        .update(guardianAthletes)
        .set({
          ...(body.isPrimary !== undefined ? { isPrimary: body.isPrimary } : {}),
          ...(body.linkRelationship !== undefined ? { relationship: body.linkRelationship ?? null } : {}),
        })
        .where(
          and(
            eq(guardianAthletes.id, linkId),
            eq(guardianAthletes.tenantId, link.tenantId),
            eq(guardianAthletes.athleteId, athleteId)
          )
        );
    }

    const [updated] = await db
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
      .where(
        and(
          eq(guardianAthletes.id, linkId),
          eq(guardianAthletes.tenantId, link.tenantId),
          eq(guardianAthletes.athleteId, athleteId),
          eq(guardians.tenantId, link.tenantId)
        )
      )
      .limit(1);

    return apiSuccess({ item: updated });
  }
});

export const DELETE = withTenant(async (_request, context) => {
  const { athleteId, linkId } = (context.params ?? {}) as { athleteId?: string; linkId?: string };

  if (!athleteId || !linkId) {
    return apiError("IDENTIFIERS_REQUIRED", "Athlete ID and Link ID are required", 400);
  }

  const link = await getGuardianLink(linkId, athleteId);

  if (!link) {
    return apiError("GUARDIAN_NOT_FOUND", "Guardian not found", 404);
  }

  const [athlete] = await db
    .select({ tenantId: athletes.tenantId, academyId: athletes.academyId })
    .from(athletes)
    .where(and(eq(athletes.id, athleteId), isNull(athletes.deletedAt)))
    .limit(1);

  if (!athlete || athlete.tenantId !== link.tenantId) {
    return apiError("GUARDIAN_NOT_FOUND", "Guardian not found", 404);
  }

  const scope = await authorizeAcademyCapability({
    context,
    resourceTenantId: athlete.tenantId,
    academyId: athlete.academyId,
    permission: "athletes:delete",
  });

  if (!scope.allowed) {
    return apiError("FORBIDDEN", "Access denied", 403);
  }

  // Verificar si es de family_contacts (sistema antiguo) o guardian_athletes (sistema nuevo)
  const isFamilyContact = link.guardianId === null;

  if (isFamilyContact) {
    // Eliminar de family_contacts
    await db
      .delete(familyContacts)
      .where(
        and(
          eq(familyContacts.id, linkId),
          eq(familyContacts.tenantId, link.tenantId),
          eq(familyContacts.athleteId, athleteId)
        )
      );
  } else {
    // Eliminar de guardian_athletes y posiblemente de guardians
    if (link.guardianId) {
      await db
        .delete(guardianAthletes)
        .where(
          and(
            eq(guardianAthletes.id, linkId),
            eq(guardianAthletes.tenantId, link.tenantId),
            eq(guardianAthletes.athleteId, athleteId)
          )
        );

      const [{ remaining }] = await db
        .select({
          remaining: sql<number>`count(*)`,
        })
        .from(guardianAthletes)
        .where(
          and(
            eq(guardianAthletes.guardianId, link.guardianId),
            eq(guardianAthletes.tenantId, link.tenantId)
          )
        );

      if (remaining === 0) {
        await db
          .delete(guardians)
          .where(
            and(
              eq(guardians.id, link.guardianId),
              eq(guardians.tenantId, link.tenantId)
            )
          );
      }
    }
  }

  return apiSuccess({ ok: true });
});


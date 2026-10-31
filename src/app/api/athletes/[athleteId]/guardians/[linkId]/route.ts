import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athletes, familyContacts, guardianAthletes, guardians } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { apiSuccess, apiError } from "@/lib/api-response";
import { withTransaction } from "@/lib/db-transactions";
import { assertAcademyOperationalWritable, lockAcademyOperationalWrites } from "@/lib/limits";

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

  const isFamilyContact = link.guardianId === null;
  const updated = await withTransaction(async (tx) => {
    await lockAcademyOperationalWrites(tx, athlete.academyId);
    await assertAcademyOperationalWritable(athlete.tenantId, athlete.academyId, tx);

    const [currentAthlete] = await tx
      .select({ id: athletes.id })
      .from(athletes)
      .where(and(
        eq(athletes.id, athleteId),
        eq(athletes.tenantId, athlete.tenantId),
        eq(athletes.academyId, athlete.academyId),
        isNull(athletes.deletedAt),
      ))
      .limit(1);
    if (!currentAthlete) return null;

    if (isFamilyContact) {
      const [currentLink] = await tx
        .select({ id: familyContacts.id })
        .from(familyContacts)
        .where(and(
          eq(familyContacts.id, linkId),
          eq(familyContacts.tenantId, link.tenantId),
          eq(familyContacts.athleteId, athleteId),
        ))
        .limit(1);
      if (!currentLink) return null;

      await tx
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

      const [row] = await tx
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
      return row ?? null;
    }

    const [currentLink] = await tx
      .select({ guardianId: guardianAthletes.guardianId })
      .from(guardianAthletes)
      .where(and(
        eq(guardianAthletes.id, linkId),
        eq(guardianAthletes.tenantId, link.tenantId),
        eq(guardianAthletes.athleteId, athleteId),
      ))
      .limit(1);
    if (!currentLink) return null;

    if (currentLink.guardianId && (body.name || body.email || body.phone || body.relationship || body.notifyEmail !== undefined || body.notifySms !== undefined)) {
      await tx
        .update(guardians)
        .set({
          ...(body.name ? { name: body.name } : {}),
          ...(body.email ? { email: body.email.toLowerCase() } : {}),
          ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
          ...(body.relationship !== undefined ? { relationship: body.relationship ?? null } : {}),
          ...(body.notifyEmail !== undefined ? { notifyEmail: body.notifyEmail } : {}),
          ...(body.notifySms !== undefined ? { notifySms: body.notifySms } : {}),
        })
        .where(and(eq(guardians.id, currentLink.guardianId), eq(guardians.tenantId, link.tenantId)));
    }

    if (body.isPrimary !== undefined || body.linkRelationship !== undefined) {
      await tx
        .update(guardianAthletes)
        .set({
          ...(body.isPrimary !== undefined ? { isPrimary: body.isPrimary } : {}),
          ...(body.linkRelationship !== undefined ? { relationship: body.linkRelationship ?? null } : {}),
        })
        .where(and(
          eq(guardianAthletes.id, linkId),
          eq(guardianAthletes.tenantId, link.tenantId),
          eq(guardianAthletes.athleteId, athleteId),
        ));
    }

    const [row] = await tx
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
        eq(guardianAthletes.tenantId, link.tenantId),
        eq(guardianAthletes.athleteId, athleteId),
        eq(guardians.tenantId, link.tenantId),
      ))
      .limit(1);
    return row ?? null;
  });

  if (!updated) return apiError("GUARDIAN_NOT_FOUND", "Guardian not found", 404);
  return apiSuccess({ item: updated });
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

  const isFamilyContact = link.guardianId === null;
  const deleted = await withTransaction(async (tx) => {
    await lockAcademyOperationalWrites(tx, athlete.academyId);
    await assertAcademyOperationalWritable(athlete.tenantId, athlete.academyId, tx);

    const [currentAthlete] = await tx
      .select({ id: athletes.id })
      .from(athletes)
      .where(and(
        eq(athletes.id, athleteId),
        eq(athletes.tenantId, athlete.tenantId),
        eq(athletes.academyId, athlete.academyId),
        isNull(athletes.deletedAt),
      ))
      .limit(1);
    if (!currentAthlete) return false;

    if (isFamilyContact) {
      const rows = await tx
        .delete(familyContacts)
        .where(and(
          eq(familyContacts.id, linkId),
          eq(familyContacts.tenantId, link.tenantId),
          eq(familyContacts.athleteId, athleteId),
        ))
        .returning({ id: familyContacts.id });
      return rows.length === 1;
    }

    const [currentLink] = await tx
      .select({ guardianId: guardianAthletes.guardianId })
      .from(guardianAthletes)
      .where(and(
        eq(guardianAthletes.id, linkId),
        eq(guardianAthletes.tenantId, link.tenantId),
        eq(guardianAthletes.athleteId, athleteId),
      ))
      .limit(1);
    if (!currentLink) return false;

    const rows = await tx
      .delete(guardianAthletes)
      .where(and(
        eq(guardianAthletes.id, linkId),
        eq(guardianAthletes.tenantId, link.tenantId),
        eq(guardianAthletes.athleteId, athleteId),
      ))
      .returning({ id: guardianAthletes.id });
    if (rows.length !== 1) return false;

    const [{ remaining }] = await tx
      .select({ remaining: sql<number>`count(*)` })
      .from(guardianAthletes)
      .where(and(
        eq(guardianAthletes.guardianId, currentLink.guardianId),
        eq(guardianAthletes.tenantId, link.tenantId),
      ));
    if (remaining === 0) {
      await tx
        .delete(guardians)
        .where(and(eq(guardians.id, currentLink.guardianId), eq(guardians.tenantId, link.tenantId)));
    }
    return true;
  });

  if (!deleted) return apiError("GUARDIAN_NOT_FOUND", "Guardian not found", 404);
  return apiSuccess({ ok: true });
});


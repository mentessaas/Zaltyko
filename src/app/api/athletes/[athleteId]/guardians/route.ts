import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athletes, familyContacts, guardianAthletes, guardians } from "@/db/schema";
import { withTenant } from "@/lib/authz";

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
    })
    .from(athletes)
    .where(eq(athletes.id, athleteId))
    .limit(1);

  return row ?? null;
}

export const GET = withTenant(async (_request, context) => {
  const { athleteId } = (context.params ?? {}) as { athleteId?: string };

  if (!athleteId) {
    return NextResponse.json({ error: "ATHLETE_ID_REQUIRED" }, { status: 400 });
  }

  const athleteRow = await ensureAthleteTenant(athleteId);

  if (!athleteRow) {
    return NextResponse.json({ error: "ATHLETE_NOT_FOUND" }, { status: 404 });
  }

  if (
    context.profile.role !== "super_admin" &&
    context.profile.role !== "admin" &&
    athleteRow.tenantId !== context.tenantId
  ) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
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
    .where(eq(guardianAthletes.athleteId, athleteId));

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
    .where(eq(familyContacts.athleteId, athleteId));

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

  return NextResponse.json({ items: allItems });
});

export const POST = withTenant(async (request, context) => {
  const { athleteId } = (context.params ?? {}) as { athleteId?: string };

  if (!athleteId) {
    return NextResponse.json({ error: "ATHLETE_ID_REQUIRED" }, { status: 400 });
  }

  const athleteRow = await ensureAthleteTenant(athleteId);

  if (!athleteRow) {
    return NextResponse.json({ error: "ATHLETE_NOT_FOUND" }, { status: 404 });
  }

  if (
    context.profile.role !== "super_admin" &&
    context.profile.role !== "admin" &&
    athleteRow.tenantId !== context.tenantId
  ) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
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
    .where(eq(guardianAthletes.id, linkId))
    .limit(1);

  return NextResponse.json({ item: guardianRow });
});



import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athletes, guardianAthletes, guardians } from "@/db/schema";
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
  const athleteId = context.params?.athleteId;

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

  const rows = await db
    .select({
      linkId: guardianAthletes.id,
      guardianId: guardians.id,
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
    .where(eq(guardianAthletes.athleteId, athleteId))
    .orderBy(guardians.createdAt);

  return NextResponse.json({ items: rows });
});

export const POST = withTenant(async (request, context) => {
  const athleteId = context.params?.athleteId;

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



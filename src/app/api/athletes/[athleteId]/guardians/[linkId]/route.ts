import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { guardianAthletes, guardians } from "@/db/schema";
import { withTenant } from "@/lib/authz";

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

async function getGuardianLink(linkId: string, athleteId: string) {
  const [row] = await db
    .select({
      linkId: guardianAthletes.id,
      guardianId: guardianAthletes.guardianId,
      tenantId: guardianAthletes.tenantId,
      athleteId: guardianAthletes.athleteId,
    })
    .from(guardianAthletes)
    .where(and(eq(guardianAthletes.id, linkId), eq(guardianAthletes.athleteId, athleteId)))
    .limit(1);

  return row ?? null;
}

export const PATCH = withTenant(async (request, context) => {
  const athleteId = context.params?.athleteId;
  const linkId = context.params?.linkId;

  if (!athleteId || !linkId) {
    return NextResponse.json({ error: "IDENTIFIERS_REQUIRED" }, { status: 400 });
  }

  const link = await getGuardianLink(linkId, athleteId);

  if (!link) {
    return NextResponse.json({ error: "GUARDIAN_NOT_FOUND" }, { status: 404 });
  }

  if (
    context.profile.role !== "super_admin" &&
    context.profile.role !== "admin" &&
    link.tenantId !== context.tenantId
  ) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = UpdateGuardianSchema.parse(await request.json());

  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "NO_CHANGES" }, { status: 400 });
  }

  if (body.name || body.email || body.phone || body.relationship || body.notifyEmail !== undefined || body.notifySms !== undefined) {
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
      .where(eq(guardians.id, link.guardianId));
  }

  if (body.isPrimary !== undefined || body.linkRelationship !== undefined) {
    await db
      .update(guardianAthletes)
      .set({
        ...(body.isPrimary !== undefined ? { isPrimary: body.isPrimary } : {}),
        ...(body.linkRelationship !== undefined ? { relationship: body.linkRelationship ?? null } : {}),
      })
      .where(eq(guardianAthletes.id, linkId));
  }

  const [updated] = await db
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

  return NextResponse.json({ item: updated });
});

export const DELETE = withTenant(async (_request, context) => {
  const athleteId = context.params?.athleteId;
  const linkId = context.params?.linkId;

  if (!athleteId || !linkId) {
    return NextResponse.json({ error: "IDENTIFIERS_REQUIRED" }, { status: 400 });
  }

  const link = await getGuardianLink(linkId, athleteId);

  if (!link) {
    return NextResponse.json({ error: "GUARDIAN_NOT_FOUND" }, { status: 404 });
  }

  if (
    context.profile.role !== "super_admin" &&
    context.profile.role !== "admin" &&
    link.tenantId !== context.tenantId
  ) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  await db.delete(guardianAthletes).where(eq(guardianAthletes.id, linkId));

  const [{ remaining }] = await db
    .select({
      remaining: sql<number>`count(*)`,
    })
    .from(guardianAthletes)
    .where(eq(guardianAthletes.guardianId, link.guardianId));

  if (remaining === 0) {
    await db.delete(guardians).where(eq(guardians.id, link.guardianId));
  }

  return NextResponse.json({ ok: true });
});



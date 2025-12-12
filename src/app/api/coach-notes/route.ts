import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";

import { db } from "@/db";
import { coachNotes, athletes, profiles } from "@/db/schema";
import { withTenant } from "@/lib/authz";

const createSchema = z.object({
  athleteId: z.string().uuid(),
  note: z.string().min(1),
  sharedWithParents: z.boolean().default(false),
  tags: z.array(z.string()).nullable().optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const athleteId = url.searchParams.get("athleteId");
  const academyId = url.searchParams.get("academyId");

  const whereConditions = [eq(coachNotes.tenantId, context.tenantId)];
  if (athleteId) {
    whereConditions.push(eq(coachNotes.athleteId, athleteId));
  }
  if (academyId) {
    whereConditions.push(eq(coachNotes.academyId, academyId));
  }

  const notes = await db
    .select({
      id: coachNotes.id,
      athleteId: coachNotes.athleteId,
      athleteName: athletes.name,
      note: coachNotes.note,
      sharedWithParents: coachNotes.sharedWithParents,
      tags: coachNotes.tags,
      createdAt: coachNotes.createdAt,
      authorId: coachNotes.authorId,
      authorName: profiles.name,
    })
    .from(coachNotes)
    .innerJoin(athletes, eq(coachNotes.athleteId, athletes.id))
    .leftJoin(profiles, eq(coachNotes.authorId, profiles.id))
    .where(and(...whereConditions))
    .orderBy(desc(coachNotes.createdAt));

  return NextResponse.json({
    items: notes.map((note) => ({
      id: note.id,
      athleteId: note.athleteId,
      athleteName: note.athleteName,
      note: note.note,
      sharedWithParents: note.sharedWithParents,
      tags: note.tags,
      createdAt: note.createdAt?.toISOString(),
      authorId: note.authorId,
      authorName: note.authorName || "Desconocido",
    })),
  });
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const profile = context.profile;

  const body = createSchema.parse(await request.json());

  // Validar que el atleta existe y pertenece al tenant
  const [athlete] = await db
    .select({
      id: athletes.id,
      academyId: athletes.academyId,
    })
    .from(athletes)
    .where(and(eq(athletes.id, body.athleteId), eq(athletes.tenantId, context.tenantId)))
    .limit(1);

  if (!athlete) {
    return NextResponse.json({ error: "ATHLETE_NOT_FOUND" }, { status: 404 });
  }

  // Crear nota
  const [newNote] = await db
    .insert(coachNotes)
    .values({
      tenantId: context.tenantId,
      academyId: athlete.academyId,
      athleteId: body.athleteId,
      authorId: profile.id,
      note: body.note,
      sharedWithParents: body.sharedWithParents,
      tags: body.tags || null,
    })
    .returning({ id: coachNotes.id });

  // TODO: Si sharedWithParents es true, enviar notificación a padres

  return NextResponse.json({ ok: true, id: newNote.id });
});

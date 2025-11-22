import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { coachNotes } from "@/db/schema";
import { withTenant, getCurrentProfile } from "@/lib/authz";

const updateSchema = z.object({
  note: z.string().min(1),
  sharedWithParents: z.boolean().default(false),
  tags: z.array(z.string()).nullable().optional(),
});

export const PUT = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const profile = await getCurrentProfile(request);
  if (!profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const noteId = (context.params as { noteId?: string } | undefined)?.noteId;

  if (!noteId) {
    return NextResponse.json({ error: "NOTE_ID_REQUIRED" }, { status: 400 });
  }

  const body = updateSchema.parse(await request.json());

  // Validar que la nota existe y pertenece al tenant
  const [noteRow] = await db
    .select({
      id: coachNotes.id,
      authorId: coachNotes.authorId,
    })
    .from(coachNotes)
    .where(and(eq(coachNotes.id, noteId), eq(coachNotes.tenantId, context.tenantId)))
    .limit(1);

  if (!noteRow) {
    return NextResponse.json({ error: "NOTE_NOT_FOUND" }, { status: 404 });
  }

  // Solo el autor puede editar (o admin)
  if (noteRow.authorId !== profile.id && profile.role !== "admin" && profile.role !== "owner") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Actualizar nota
  await db
    .update(coachNotes)
    .set({
      note: body.note,
      sharedWithParents: body.sharedWithParents,
      tags: body.tags || null,
      updatedAt: new Date(),
    })
    .where(eq(coachNotes.id, noteId));

  // TODO: Si sharedWithParents cambió a true, enviar notificación a padres

  return NextResponse.json({ ok: true });
});

export const DELETE = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const profile = await getCurrentProfile(_request);
  if (!profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const noteId = (context.params as { noteId?: string } | undefined)?.noteId;

  if (!noteId) {
    return NextResponse.json({ error: "NOTE_ID_REQUIRED" }, { status: 400 });
  }

  // Validar que la nota existe y pertenece al tenant
  const [noteRow] = await db
    .select({
      id: coachNotes.id,
      authorId: coachNotes.authorId,
    })
    .from(coachNotes)
    .where(and(eq(coachNotes.id, noteId), eq(coachNotes.tenantId, context.tenantId)))
    .limit(1);

  if (!noteRow) {
    return NextResponse.json({ error: "NOTE_NOT_FOUND" }, { status: 404 });
  }

  // Solo el autor puede eliminar (o admin)
  if (noteRow.authorId !== profile.id && profile.role !== "admin" && profile.role !== "owner") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Eliminar nota
  await db.delete(coachNotes).where(eq(coachNotes.id, noteId));

  return NextResponse.json({ ok: true });
});


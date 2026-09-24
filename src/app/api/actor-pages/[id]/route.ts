import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { actorPages, type ActorPage } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canEditActorPage } from "@/lib/actor-pages/permissions";

/**
 * GET /api/actor-pages/[id]
 * Devuelve una actor_page si el usuario actual puede verla (admin, owner, o pública).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [row] = await db
    .select()
    .from(actorPages)
    .where(eq(actorPages.id, params.id))
    .limit(1);

  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Si no es owner/admin, sólo lectura pública (published + visible)
  const isOwner = await canEditActorPage(user, row);
  if (!isOwner && !(row.publicVisible && row.publishedAt)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json(row);
}

/**
 * PATCH /api/actor-pages/[id]
 * Actualiza campos de una página del actor. Solo el owner del entity.
 * Acepta: { displayName?, tagline?, bioBlocks?, photoUrl?, contactEmail?,
 *           contactPhone?, socialLinks?, theme?, seoTitle?, seoDescription?,
 *           seoImageUrl?, language?, autoTranslate? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [row] = await db
    .select()
    .from(actorPages)
    .where(eq(actorPages.id, params.id))
    .limit(1);

  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const isOwner = await canEditActorPage(user, row);
  if (!isOwner) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const allowed: Array<keyof ActorPage> = [
    "displayName",
    "tagline",
    "bioBlocks",
    "photoUrl",
    "contactEmail",
    "contactPhone",
    "socialLinks",
    "theme",
    "seoTitle",
    "seoDescription",
    "seoImageUrl",
    "language",
    "autoTranslate",
  ];

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  await db
    .update(actorPages)
    .set(patch)
    .where(eq(actorPages.id, params.id));

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/actor-pages/[id]
 * Soft delete: blocked_reason = "deleted" y public_visible = false.
 * El owner puede restaurar re-activando desde el editor.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [row] = await db
    .select()
    .from(actorPages)
    .where(eq(actorPages.id, params.id))
    .limit(1);

  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const isOwner = await canEditActorPage(user, row);
  if (!isOwner) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await db
    .update(actorPages)
    .set({
      publicVisible: false,
      blockedReason: "deleted_by_owner",
      updatedAt: new Date(),
    })
    .where(eq(actorPages.id, params.id));

  return NextResponse.json({ ok: true });
}

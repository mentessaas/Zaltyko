import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { actorPages, academies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canEditActorPage } from "@/lib/actor-pages/permissions";
import { uploadFile } from "@/lib/supabase/storage-helpers";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * POST /api/actor-pages/[id]/photo
 * multipart/form-data con campo "file".
 * Sube la foto a Storage y actualiza el campo photoUrl del actor_page.
 *
 * T8.5: subida de logo para actor_pages (academia/coach/athlete/supplier).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [page] = await db
    .select()
    .from(actorPages)
    .where(eq(actorPages.id, params.id))
    .limit(1);
  if (!page) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (!(await canEditActorPage(user, page))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "invalid_form" }, { status: 400 });

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "file_too_large", detail: `Max ${MAX_SIZE} bytes` },
      { status: 400 }
    );
  }
  const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: "invalid_type", detail: file.type },
      { status: 400 }
    );
  }

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${page.entityType}/${page.entityId}/${Date.now()}.${ext}`;

  try {
    const result = await uploadFile(file, path, {
      contentType: file.type,
      upsert: true,
      bucket: "actor-photos",
    });
    await db
      .update(actorPages)
      .set({ photoUrl: result.url, updatedAt: new Date() })
      .where(eq(actorPages.id, params.id));
    return NextResponse.json({ url: result.url });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: "upload_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 }
    );
  }
}

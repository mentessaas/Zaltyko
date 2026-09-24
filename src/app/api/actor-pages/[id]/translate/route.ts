import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { actorPages } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canEditActorPage } from "@/lib/actor-pages/permissions";
import { translateBlocks, type TranslatableBlock } from "@/lib/i18n/translate";

/**
 * POST /api/actor-pages/[id]/translate
 * Body: { target: "en" | "es" }
 * Auto-traduce los bloques de texto via MiniMax y devuelve los bloques
 * traducidos. NO persiste — el caller decide si los guarda (PATCH al page).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const target = body?.target as "en" | "es" | undefined;
  if (target !== "en" && target !== "es") {
    return NextResponse.json({ error: "invalid_target" }, { status: 400 });
  }

  const [page] = await db
    .select()
    .from(actorPages)
    .where(eq(actorPages.id, params.id))
    .limit(1);
  if (!page) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await canEditActorPage(user, page))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const blocks = Array.isArray(page.bioBlocks) ? (page.bioBlocks as TranslatableBlock[]) : [];
  const source = (page.language === "en" ? "en" : "es") as "es" | "en";
  const translated = await translateBlocks(blocks, source, target);

  return NextResponse.json({ blocks: translated, target });
}

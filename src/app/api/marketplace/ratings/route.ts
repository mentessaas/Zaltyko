import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateCounterparty } from "@/lib/trust/service";

/**
 * POST /api/marketplace/ratings
 * Body: { orderId, stars, comment? }
 * Califica a la contraparte después de un pago confirmado.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { orderId, stars, comment } = body ?? {};
  if (!orderId || typeof stars !== "number" || stars < 1 || stars > 5) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const [academy] = await db
    .select({ id: academies.id })
    .from(academies)
    .innerJoin(sql`profiles`, sql`${academies.ownerId} = ${sql.raw("profiles.id")}`)
    .where(sql`${sql.raw("profiles.user_id")} = ${user.id}`)
    .limit(1);
  if (!academy) return NextResponse.json({ error: "no_academy" }, { status: 403 });

  try {
    const rating = await rateCounterparty({
      orderId,
      raterAcademyId: academy.id,
      stars,
      comment: typeof comment === "string" ? comment : undefined,
    });
    return NextResponse.json(rating, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: "rating_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 400 }
    );
  }
}

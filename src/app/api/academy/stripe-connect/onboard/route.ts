import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { apiError } from "@/lib/api-response";
import {
  FAMILY_AUTOMATIC_COLLECTION_DISABLED,
  FAMILY_AUTOMATIC_COLLECTION_DISABLED_MESSAGE,
} from "@/lib/stripe/family-automatic-collection-disabled";

/**
 * POST /api/academy/stripe-connect/onboard
 * Body: { academyId, country, returnUrl }
 *
 * Conserva autenticación y propiedad de academia, pero la conexión Connect
 * queda deshabilitada en el lanzamiento manual-only.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const academyId = body?.academyId;
  if (!academyId || typeof academyId !== "string") {
    return NextResponse.json({ error: "missing_academyId" }, { status: 400 });
  }

  // Permiso: solo el owner del academy.
  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
      ownerId: academies.ownerId,
      tenantId: academies.tenantId,
    })
    .from(academies)
    .innerJoin(sql`profiles`, sql`${academies.ownerId} = ${sql.raw("profiles.id")}`)
    .where(
      sql`${academies.id} = ${academyId} AND ${sql.raw("profiles.user_id")} = ${user.id}`
    )
    .limit(1);
  if (!academy) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  return apiError(
    FAMILY_AUTOMATIC_COLLECTION_DISABLED,
    FAMILY_AUTOMATIC_COLLECTION_DISABLED_MESSAGE,
    410,
    undefined,
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

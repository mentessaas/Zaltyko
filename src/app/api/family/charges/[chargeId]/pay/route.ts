import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { charges } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { getFamilyChildrenForUser } from "@/lib/family/scope-service";
import { collectCharge } from "@/lib/stripe/charge-collection-service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/family/charges/[chargeId]/pay
 *
 * Permite a un padre/madre pagar una cuota pendiente con la tarjeta guardada.
 * Verifica que el cargo pertenece a uno de sus hijos y dispara collectCharge.
 */
export async function POST(request: Request) {
  try {
    const chargeId = new URL(request.url).pathname.match(
      /^\/api\/family\/charges\/([^/]+)\/pay/
    )?.[1];
    if (!chargeId) {
      return NextResponse.json({ error: "CHARGE_ID_REQUIRED" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !user.email) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const [charge] = await db
      .select({ id: charges.id, athleteId: charges.athleteId })
      .from(charges)
      .where(eq(charges.id, chargeId))
      .limit(1);
    if (!charge) {
      return NextResponse.json({ error: "CHARGE_NOT_FOUND" }, { status: 404 });
    }

    const children = await getFamilyChildrenForUser({ userId: user.id, email: user.email });
    if (!children.some((child) => child.id === charge.athleteId)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const result = await collectCharge(chargeId);
    if (result.status === "paid") {
      return NextResponse.json({ ok: true, status: "paid" });
    }
    if (result.status === "requires_action") {
      return NextResponse.json({ error: "REQUIRES_ACTION" }, { status: 409 });
    }
    if (result.status === "skipped") {
      return NextResponse.json({ error: result.reason }, { status: 409 });
    }
    return NextResponse.json({ error: result.reason }, { status: 402 });
  } catch (error) {
    logger.error("Error paying family charge", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { charges, receipts } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { getFamilyChildrenForUser } from "@/lib/family/scope-service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/family/charges/[chargeId]/receipt
 *
 * Devuelve la URL del recibo de un cargo pagado, si el padre/madre es familia
 * del atleta. No genera facturas fiscales: es un justificante simple.
 */
export async function GET(request: Request) {
  try {
    const chargeId = new URL(request.url).pathname.match(
      /^\/api\/family\/charges\/([^/]+)\/receipt/
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

    const [receipt] = await db
      .select({ pdfUrl: receipts.pdfUrl, receiptNumber: receipts.receiptNumber })
      .from(receipts)
      .where(eq(receipts.chargeId, chargeId))
      .orderBy(desc(receipts.createdAt))
      .limit(1);

    if (!receipt?.pdfUrl) {
      return NextResponse.json({ error: "RECEIPT_NOT_AVAILABLE" }, { status: 404 });
    }

    return NextResponse.json({ url: receipt.pdfUrl, receiptNumber: receipt.receiptNumber });
  } catch (error) {
    logger.error("Error fetching family receipt", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { receipts } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { resolveFamilyChargeAccess } from "@/lib/family/payment-access";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** @resource-scope guardian — receipt charge must belong to a linked child. */

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

    const charge = await resolveFamilyChargeAccess({ userId: user.id, email: user.email, chargeId });
    if (!charge) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const [receipt] = await db
      .select({ pdfUrl: receipts.pdfUrl, receiptNumber: receipts.receiptNumber })
      .from(receipts)
      .where(and(eq(receipts.chargeId, chargeId), eq(receipts.athleteId, charge.athleteId)))
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

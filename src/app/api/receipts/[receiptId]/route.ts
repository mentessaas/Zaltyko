import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { withTenant } from "@/lib/authz";
import { generateReceiptPDF } from "@/lib/receipts/receipt-generator";

import { db } from "@/db";
import { receipts, athletes, academies } from "@/db/schema";

export const GET = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const receiptId = (context.params as { receiptId?: string } | undefined)?.receiptId;

  if (!receiptId) {
    return NextResponse.json({ error: "RECEIPT_ID_REQUIRED" }, { status: 400 });
  }

  const [receipt] = await db
    .select({
      id: receipts.id,
      academyId: receipts.academyId,
      athleteId: receipts.athleteId,
      amount: receipts.amount,
      currency: receipts.currency,
      period: receipts.period,
      items: receipts.items,
      createdAt: receipts.createdAt,
      academyName: academies.name,
      athleteName: athletes.name,
    })
    .from(receipts)
    .innerJoin(academies, eq(receipts.academyId, academies.id))
    .innerJoin(athletes, eq(receipts.athleteId, athletes.id))
    .where(and(eq(receipts.id, receiptId), eq(receipts.tenantId, context.tenantId)))
    .limit(1);

  if (!receipt) {
    return NextResponse.json({ error: "RECEIPT_NOT_FOUND" }, { status: 404 });
  }

  const pdfBuffer = await generateReceiptPDF({
    receiptId: receipt.id,
    academyName: receipt.academyName || "Academia",
    athleteName: receipt.athleteName || "Atleta",
    amount: Number(receipt.amount) / 100,
    currency: receipt.currency,
    period: receipt.period,
    items: (receipt.items as Array<{ description: string; amount: number }>) || [],
    date: receipt.createdAt || new Date(),
  });

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="recibo-${receiptId}.pdf"`,
    },
  });
});


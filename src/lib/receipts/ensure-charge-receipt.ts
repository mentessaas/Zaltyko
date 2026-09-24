import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { academies, athletes, charges, receipts } from "@/db/schema";
import { withTransaction, type TransactionClient } from "@/lib/db-transactions";

/**
 * Crea el justificante interno una sola vez para un cargo liquidado.
 * La clave natural es (academy, charge) y el índice de numeración de recibos
 * aporta la segunda barrera frente a carreras concurrentes.
 */
export async function ensureChargeReceipt(params: {
  chargeId: string;
  paymentMethod?: string | null;
  createdBy?: string | null;
}, transaction?: TransactionClient) {
  const createReceipt = async (tx: TransactionClient) => {
    if ("execute" in tx && typeof tx.execute === "function") {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${params.chargeId}))`);
    }

    const [existing] = await tx
      .select({ id: receipts.id, receiptNumber: receipts.receiptNumber })
      .from(receipts)
      .where(eq(receipts.chargeId, params.chargeId))
      .limit(1);
    if (existing) return existing;

    const [charge] = await tx
      .select({
        id: charges.id,
        tenantId: charges.tenantId,
        academyId: charges.academyId,
        athleteId: charges.athleteId,
        amountCents: charges.amountCents,
        currency: charges.currency,
        period: charges.period,
        label: charges.label,
        paidAt: charges.paidAt,
      })
      .from(charges)
      .where(and(eq(charges.id, params.chargeId), eq(charges.status, "paid")))
      .limit(1);
    if (!charge) return null;

    const [academy] = await tx.select({ name: academies.name }).from(academies).where(eq(academies.id, charge.academyId)).limit(1);
    const [athlete] = charge.athleteId
      ? await tx.select({ name: athletes.name }).from(athletes).where(eq(athletes.id, charge.athleteId)).limit(1)
      : [];
    const receiptNumber = `ZAL-${charge.id.slice(0, 8).toUpperCase()}`;
    const [created] = await tx.insert(receipts).values({
      tenantId: charge.tenantId,
      academyId: charge.academyId,
      chargeId: charge.id,
      athleteId: charge.athleteId,
      receiptNumber,
      amount: (charge.amountCents / 100).toFixed(2),
      currency: (charge.currency || "EUR").toUpperCase(),
      paymentMethod: params.paymentMethod ?? "card",
      paymentDate: (charge.paidAt ?? new Date()).toISOString().slice(0, 10),
      pdfUrl: `/api/receipts/RECEIPT_ID_PENDING`,
      metadata: {
        period: charge.period,
        // El generador PDF trabaja en unidades monetarias (no céntimos).
        items: [{ description: charge.label || "Pago de cuota", amount: charge.amountCents / 100 }],
        academyName: academy?.name,
        athleteName: athlete?.name,
      },
      createdBy: params.createdBy ?? null,
    }).returning({ id: receipts.id, receiptNumber: receipts.receiptNumber });
    if (!created) return null;
    const pdfUrl = `/api/receipts/${created.id}`;
    await tx.update(receipts).set({ pdfUrl, updatedAt: new Date() }).where(eq(receipts.id, created.id));
    return { ...created, pdfUrl };
  };
  // Reuse the caller transaction: the same charge lock cannot be acquired
  // on another connection while the caller is waiting for its receipt.
  return transaction ? createReceipt(transaction) : withTransaction(createReceipt);
}

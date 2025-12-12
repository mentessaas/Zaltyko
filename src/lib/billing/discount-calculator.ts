import { db } from "@/db";
import { discounts, scholarships, charges } from "@/db/schema";
import { eq, and, gte, lte, or, sql } from "drizzle-orm";

export interface DiscountApplication {
  discountId: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
}

/**
 * Calcula el descuento aplicable a un monto
 */
export async function calculateDiscount(
  academyId: string,
  tenantId: string,
  amount: number,
  discountCode?: string,
  athleteId?: string
): Promise<DiscountApplication | null> {
  const today = new Date().toISOString().split("T")[0];

  // Buscar descuento por código
  if (discountCode) {
    const [discount] = await db
      .select()
      .from(discounts)
      .where(
        and(
          eq(discounts.academyId, academyId),
          eq(discounts.tenantId, tenantId),
          eq(discounts.code, discountCode),
          eq(discounts.isActive, true),
          lte(discounts.startDate, today),
          or(
            sql`${discounts.endDate} IS NULL`,
            gte(discounts.endDate, today)
          ),
          or(
            sql`${discounts.maxUses} IS NULL`,
            sql`${discounts.currentUses} < ${discounts.maxUses}`
          )
        )
      )
      .limit(1);

    if (discount) {
      const discountValue = Number(discount.discountValue);
      let discountAmount = 0;

      if (discount.discountType === "percentage") {
        discountAmount = (amount * discountValue) / 100;
        if (discount.maxDiscount) {
          discountAmount = Math.min(discountAmount, Number(discount.maxDiscount));
        }
      } else {
        discountAmount = discountValue;
      }

      const finalAmount = Math.max(0, amount - discountAmount);

      return {
        discountId: discount.id,
        discountType: discount.discountType as "percentage" | "fixed",
        discountValue: discountValue,
        originalAmount: amount,
        discountAmount: Math.round(discountAmount * 100) / 100,
        finalAmount: Math.round(finalAmount * 100) / 100,
      };
    }
  }

  // Buscar beca del atleta
  if (athleteId) {
    const [scholarship] = await db
      .select()
      .from(scholarships)
      .where(
        and(
          eq(scholarships.academyId, academyId),
          eq(scholarships.tenantId, tenantId),
          eq(scholarships.athleteId, athleteId),
          eq(scholarships.isActive, true),
          lte(scholarships.startDate, today),
          or(
            sql`${scholarships.endDate} IS NULL`,
            gte(scholarships.endDate, today)
          )
        )
      )
      .limit(1);

    if (scholarship) {
      const discountValue = Number(scholarship.discountValue);
      let discountAmount = 0;

      if (scholarship.discountType === "percentage") {
        discountAmount = (amount * discountValue) / 100;
      } else {
        discountAmount = discountValue;
      }

      const finalAmount = Math.max(0, amount - discountAmount);

      return {
        discountId: scholarship.id,
        discountType: scholarship.discountType as "percentage" | "fixed",
        discountValue: discountValue,
        originalAmount: amount,
        discountAmount: Math.round(discountAmount * 100) / 100,
        finalAmount: Math.round(finalAmount * 100) / 100,
      };
    }
  }

  return null;
}

/**
 * Aplica un descuento a un cargo
 */
export async function applyDiscountToCharge(
  chargeId: string,
  discountApplication: DiscountApplication
) {
  // Actualizar el monto del cargo
  await db
    .update(charges)
    .set({
      amountCents: Math.round(discountApplication.finalAmount * 100),
    })
    .where(eq(charges.id, chargeId));

  // Incrementar contador de usos del descuento
  await db
    .update(discounts)
    .set({
      currentUses: sql`${discounts.currentUses} + 1`,
    })
    .where(eq(discounts.id, discountApplication.discountId));
}


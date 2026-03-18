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
  discountCategory?: "regular" | "early_payment" | "loyalty" | "promotional";
}

export interface EarlyPaymentDiscount {
  available: boolean;
  earlyPaymentDays: number;
  discountValue: number;
  discountType: "percentage" | "fixed";
  discountAmount: number;
  finalAmount: number;
  dueDate?: string;
  earlyPaymentDeadline?: string;
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

/**
 * Calcula el descuento por pronto pago aplicable a un cargo
 * Busca descuentos de tipo early_payment activos y vigentes
 */
export async function calculateEarlyPaymentDiscount(
  academyId: string,
  tenantId: string,
  amount: number,
  paymentDueDate?: string
): Promise<EarlyPaymentDiscount> {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // Buscar descuento por pronto pago activo
  const [discount] = await db
    .select()
    .from(discounts)
    .where(
      and(
        eq(discounts.academyId, academyId),
        eq(discounts.tenantId, tenantId),
        eq(discounts.discountCategory, "early_payment"),
        eq(discounts.isActive, true),
        lte(discounts.startDate, todayStr),
        or(
          sql`${discounts.endDate} IS NULL`,
          gte(discounts.endDate, todayStr)
        )
      )
    )
    .limit(1);

  if (!discount || !discount.earlyPaymentDiscount || !discount.earlyPaymentDays) {
    return {
      available: false,
      earlyPaymentDays: 0,
      discountValue: 0,
      discountType: "percentage",
      discountAmount: 0,
      finalAmount: amount,
    };
  }

  const discountValue = Number(discount.earlyPaymentDiscount);
  const earlyPaymentDeadline = discount.earlyPaymentDays
    ? new Date(today.getTime() + discount.earlyPaymentDays * 24 * 60 * 60 * 1000)
    : undefined;

  // Verificar si la fecha de pago está dentro del período de pronto pago
  let isWithinEarlyPaymentPeriod = true;
  if (paymentDueDate) {
    const dueDate = new Date(paymentDueDate);
    const deadline = new Date(today.getTime() + discount.earlyPaymentDays * 24 * 60 * 60 * 1000);
    isWithinEarlyPaymentPeriod = today <= deadline;
  }

  let discountAmount = 0;
  if (isWithinEarlyPaymentPeriod) {
    if (discount.discountType === "percentage") {
      discountAmount = (amount * discountValue) / 100;
    } else {
      discountAmount = discountValue;
    }

    if (discount.maxDiscount) {
      discountAmount = Math.min(discountAmount, Number(discount.maxDiscount));
    }
  }

  const finalAmount = Math.max(0, amount - discountAmount);

  return {
    available: isWithinEarlyPaymentPeriod && discountAmount > 0,
    earlyPaymentDays: discount.earlyPaymentDays,
    discountValue,
    discountType: discount.discountType as "percentage" | "fixed",
    discountAmount: Math.round(discountAmount * 100) / 100,
    finalAmount: Math.round(finalAmount * 100) / 100,
    dueDate: paymentDueDate,
    earlyPaymentDeadline: earlyPaymentDeadline?.toISOString().split("T")[0],
  };
}

/**
 * Obtiene todos los descuentos de pronto pago disponibles para una academia
 */
export async function getEarlyPaymentDiscounts(
  academyId: string,
  tenantId: string
): Promise<EarlyPaymentDiscount[]> {
  const todayStr = new Date().toISOString().split("T")[0];

  const discountRows = await db
    .select()
    .from(discounts)
    .where(
      and(
        eq(discounts.academyId, academyId),
        eq(discounts.tenantId, tenantId),
        eq(discounts.discountCategory, "early_payment"),
        eq(discounts.isActive, true),
        lte(discounts.startDate, todayStr),
        or(
          sql`${discounts.endDate} IS NULL`,
          gte(discounts.endDate, todayStr)
        )
      )
    );

  return discountRows.map((discount) => {
    const discountValue = Number(discount.earlyPaymentDiscount || 0);
    const discountType = (discount.discountType || "percentage") as "percentage" | "fixed";

    return {
      available: true,
      earlyPaymentDays: discount.earlyPaymentDays || 0,
      discountValue,
      discountType,
      discountAmount: discountType === "percentage" ? discountValue : 0,
      finalAmount: 0, // Se calculará según el monto
      earlyPaymentDeadline: discount.endDate || undefined,
    };
  });
}


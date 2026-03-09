import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { withTenant } from "@/lib/authz";

import { db } from "@/db";
import { discounts, discountUsageHistory, charges } from "@/db/schema";

const applyDiscountSchema = z.object({
  academyId: z.string().uuid(),
  discountId: z.string().uuid(),
  chargeId: z.string().uuid(),
  athleteId: z.string().uuid(),
  amount: z.number(),
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const body = applyDiscountSchema.parse(await request.json());
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // Verificar que el descuento existe y está activo
  const [discount] = await db
    .select()
    .from(discounts)
    .where(
      and(
        eq(discounts.id, body.discountId),
        eq(discounts.academyId, body.academyId),
        eq(discounts.isActive, true),
        eq(discounts.tenantId, context.tenantId)
      )
    )
    .limit(1);

  if (!discount) {
    return NextResponse.json({ error: "DISCOUNT_NOT_FOUND" }, { status: 404 });
  }

  // Verificar fecha de vigencia
  if (discount.startDate > todayStr) {
    return NextResponse.json(
      { error: "DISCOUNT_NOT_YET_VALID" },
      { status: 400 }
    );
  }

  if (discount.endDate && discount.endDate < todayStr) {
    return NextResponse.json({ error: "DISCOUNT_EXPIRED" }, { status: 400 });
  }

  // Verificar límite de usos
  if (discount.maxUses && Number(discount.currentUses) >= discount.maxUses) {
    return NextResponse.json({ error: "MAX_USES_REACHED" }, { status: 400 });
  }

  // Verificar monto mínimo
  if (discount.minAmount && body.amount < Number(discount.minAmount)) {
    return NextResponse.json(
      { error: "BELOW_MIN_AMOUNT", minAmount: Number(discount.minAmount) },
      { status: 400 }
    );
  }

  // Verificar que el cargo existe
  const [charge] = await db
    .select()
    .from(charges)
    .where(
      and(
        eq(charges.id, body.chargeId),
        eq(charges.academyId, body.academyId),
        eq(charges.tenantId, context.tenantId)
      )
    )
    .limit(1);

  if (!charge) {
    return NextResponse.json({ error: "CHARGE_NOT_FOUND" }, { status: 404 });
  }

  // Calcular el descuento
  const discountValue = Number(discount.discountValue);
  let discountAmount = 0;

  if (discount.discountType === "percentage") {
    discountAmount = (body.amount * discountValue) / 100;
    // Verificar descuento máximo si aplica
    if (discount.maxDiscount) {
      const maxDiscount = Number(discount.maxDiscount);
      if (discountAmount > maxDiscount) {
        discountAmount = maxDiscount;
      }
    }
  } else {
    discountAmount = Math.min(discountValue, body.amount);
  }

  const finalAmount = Math.max(0, body.amount - discountAmount);

  // Registrar el uso del descuento
  await db.insert(discountUsageHistory).values({
    tenantId: context.tenantId,
    academyId: body.academyId,
    discountId: body.discountId,
    athleteId: body.athleteId,
    chargeId: body.chargeId,
    code: discount.code,
    discountAmount: discountAmount.toString(),
    originalAmount: body.amount.toString(),
    finalAmount: finalAmount.toString(),
  });

  // Actualizar el contador de usos
  await db
    .update(discounts)
    .set({
      currentUses: Number(discount.currentUses) + 1,
      updatedAt: new Date(),
    })
    .where(eq(discounts.id, body.discountId));

  return NextResponse.json({
    success: true,
    appliedDiscount: {
      discountId: discount.id,
      discountName: discount.name,
      discountAmount,
      originalAmount: body.amount,
      finalAmount,
    },
  });
});

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, gte, lte, isNull } from "drizzle-orm";
import { withTenant } from "@/lib/authz";
import { db } from "@/db";
import { discounts } from "@/db/schema";

const validateCodeSchema = z.object({
  academyId: z.string().uuid(),
  code: z.string(),
  amount: z.number().optional(),
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const body = validateCodeSchema.parse(await request.json());
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // Buscar el descuento por código
  const [discount] = await db
    .select()
    .from(discounts)
    .where(
      and(
        eq(discounts.academyId, body.academyId),
        eq(discounts.code, body.code.toUpperCase()),
        eq(discounts.isActive, true),
        eq(discounts.tenantId, context.tenantId)
      )
    )
    .limit(1);

  if (!discount) {
    return NextResponse.json(
      { valid: false, error: "Código promocional no válido o expirado" },
      { status: 404 }
    );
  }

  const discountValue = Number(discount.discountValue);
  const startDate = discount.startDate;
  const endDate = discount.endDate;

  // Verificar fecha de inicio
  if (startDate > todayStr) {
    return NextResponse.json(
      { valid: false, error: "El código promocional aún no está vigente" },
      { status: 400 }
    );
  }

  // Verificar fecha de fin
  if (endDate && endDate < todayStr) {
    return NextResponse.json(
      { valid: false, error: "El código promocional ha expirado" },
      { status: 400 }
    );
  }

  // Verificar límite de usos
  if (discount.maxUses && Number(discount.currentUses) >= discount.maxUses) {
    return NextResponse.json(
      { valid: false, error: "El código promocional ha alcanzado su límite de usos" },
      { status: 400 }
    );
  }

  // Verificar monto mínimo
  if (body.amount && discount.minAmount) {
    const minAmount = Number(discount.minAmount);
    if (body.amount < minAmount) {
      return NextResponse.json(
        {
          valid: false,
          error: `El monto mínimo para aplicar este descuento es de ${minAmount}`,
        },
        { status: 400 }
      );
    }
  }

  // Calcular el descuento
  let discountAmount = 0;
  let finalAmount = body.amount || 0;

  if (discount.discountType === "percentage") {
    discountAmount = (finalAmount * discountValue) / 100;
    // Verificar descuento máximo si aplica
    if (discount.maxDiscount) {
      const maxDiscount = Number(discount.maxDiscount);
      if (discountAmount > maxDiscount) {
        discountAmount = maxDiscount;
      }
    }
  } else {
    // Fixed amount
    discountAmount = discountValue;
  }

  finalAmount = Math.max(0, finalAmount - discountAmount);

  return NextResponse.json({
    valid: true,
    discount: {
      id: discount.id,
      name: discount.name,
      description: discount.description,
      discountType: discount.discountType,
      discountValue: discountValue,
      discountAmount,
      finalAmount,
    },
  });
});

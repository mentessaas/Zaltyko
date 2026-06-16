import { apiError, apiSuccess } from "@/lib/api-response";
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
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
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
    return apiError("INVALID_CODE", "Código promocional no válido o expirado", 404);
  }

  const discountValue = Number(discount.discountValue);
  const startDate = discount.startDate;
  const endDate = discount.endDate;

  // Verificar fecha de inicio
  if (startDate > todayStr) {
    return apiError("CODE_NOT_YET_VALID", "El código promocional aún no está vigente", 400);
  }

  // Verificar fecha de fin
  if (endDate && endDate < todayStr) {
    return apiError("CODE_EXPIRED", "El código promocional ha expirado", 400);
  }

  // Verificar límite de usos
  if (discount.maxUses && Number(discount.currentUses) >= discount.maxUses) {
    return apiError("CODE_MAX_USES_REACHED", "El código promocional ha alcanzado su límite de usos", 400);
  }

  // Verificar monto mínimo
  if (body.amount && discount.minAmount) {
    const minAmount = Number(discount.minAmount);
    if (body.amount < minAmount) {
      return apiError("BELOW_MIN_AMOUNT", `El monto mínimo para aplicar este descuento es de ${minAmount}`, 400);
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

  return apiSuccess({
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

import { desc, eq } from "drizzle-orm";
import { apiSuccess, apiError } from "@/lib/api-response";
import { z } from "zod";

import { db } from "@/db";
import { academies, billingInvoices } from "@/db/schema";
import { withTenant } from "@/lib/authz";

const BodySchema = z.object({
  academyId: z.string().uuid({
    message: "El ID de la academia debe ser un UUID válido",
  }),
  limit: z
    .number()
    .min(1, { message: "El límite debe ser al menos 1" })
    .max(50, { message: "El límite máximo es 50" })
    .optional(),
});

export const POST = withTenant(async (request, context) => {
  // Validar JSON parseable
  let body;
  try {
    body = BodySchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_ERROR", "Los datos proporcionados no son válidos", 400);
    }
    return apiError("INVALID_JSON", "El cuerpo de la petición no es un JSON válido", 400);
  }

  // Obtener academia y verificar acceso
  const [academy] = await db
    .select({ tenantId: academies.tenantId })
    .from(academies)
    .where(eq(academies.id, body.academyId))
    .limit(1);

  if (!academy) {
    return apiError("ACADEMY_NOT_FOUND", "La academia especificada no existe", 404);
  }

  const isAdmin = context.profile.role === "admin" || context.profile.role === "super_admin";
  if (!isAdmin && academy.tenantId !== context.tenantId) {
    return apiError("FORBIDDEN", "No tienes acceso a los datos de facturación de esta academia", 403);
  }

  const limit = body.limit ?? 20;

  try {
    const rows = await db
      .select({
        id: billingInvoices.id,
        status: billingInvoices.status,
        amountDue: billingInvoices.amountDue,
        amountPaid: billingInvoices.amountPaid,
        currency: billingInvoices.currency,
        billingReason: billingInvoices.billingReason,
        hostedInvoiceUrl: billingInvoices.hostedInvoiceUrl,
        invoicePdf: billingInvoices.invoicePdf,
        periodStart: billingInvoices.periodStart,
        periodEnd: billingInvoices.periodEnd,
        notes: billingInvoices.notes,
        createdAt: billingInvoices.createdAt,
        stripeInvoiceId: billingInvoices.stripeInvoiceId,
      })
      .from(billingInvoices)
      .where(eq(billingInvoices.academyId, body.academyId))
      .orderBy(desc(billingInvoices.createdAt))
      .limit(limit);

    return apiSuccess(rows);
  } catch (error) {
    console.error("[billing/history] Error fetching invoices:", error);
    return apiError("INTERNAL_ERROR", "Error al obtener el historial de facturación. Intenta de nuevo más tarde.", 500);
  }
});



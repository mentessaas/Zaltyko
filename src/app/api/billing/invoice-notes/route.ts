import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, billingInvoices } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

const BodySchema = z.object({
  academyId: z.string().uuid({
    message: "El ID de la academia debe ser un UUID válido",
  }),
  invoiceId: z.string().uuid({
    message: "El ID de la factura debe ser un UUID válido",
  }),
  notes: z
    .string()
    .max(1000, { message: "Las notas no pueden exceder 1000 caracteres" })
    .optional(),
});

export const POST = withTenant(async (request, context) => {
  // Validar body
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

  // Verificar que la factura existe y pertenece a la academia
  const [invoice] = await db
    .select({
      id: billingInvoices.id,
      academyId: billingInvoices.academyId,
    })
    .from(billingInvoices)
    .where(eq(billingInvoices.id, body.invoiceId))
    .limit(1);

  if (!invoice) {
    return apiError("INVOICE_NOT_FOUND", "La factura especificada no existe", 404);
  }

  if (invoice.academyId !== body.academyId) {
    return apiError("INVOICE_MISMATCH", "La factura no pertenece a la academia especificada", 400);
  }

  try {
    // Actualizar notas
    const [updated] = await db
      .update(billingInvoices)
      .set({
        notes: body.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(billingInvoices.id, body.invoiceId))
      .returning({
        id: billingInvoices.id,
        notes: billingInvoices.notes,
      });

    return apiSuccess({ invoice: updated });
  } catch (error) {
    logger.error("[billing/invoice/notes] Error updating invoice notes:", error);
    return apiError("INTERNAL_ERROR", "Error al actualizar las notas de la factura. Intenta de nuevo más tarde.", 500);
  }
});

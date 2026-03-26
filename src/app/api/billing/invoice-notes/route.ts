import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { academies, billingInvoices } from "@/db/schema";
import { withTenant } from "@/lib/authz";

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
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Los datos proporcionados no son válidos",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "INVALID_JSON", message: "El cuerpo de la petición no es un JSON válido" },
      { status: 400 }
    );
  }

  // Obtener academia y verificar acceso
  const [academy] = await db
    .select({ tenantId: academies.tenantId })
    .from(academies)
    .where(eq(academies.id, body.academyId))
    .limit(1);

  if (!academy) {
    return NextResponse.json(
      { error: "ACADEMY_NOT_FOUND", message: "La academia especificada no existe" },
      { status: 404 }
    );
  }

  const isAdmin = context.profile.role === "admin" || context.profile.role === "super_admin";
  if (!isAdmin && academy.tenantId !== context.tenantId) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "No tienes acceso a los datos de facturación de esta academia" },
      { status: 403 }
    );
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
    return NextResponse.json(
      { error: "INVOICE_NOT_FOUND", message: "La factura especificada no existe" },
      { status: 404 }
    );
  }

  if (invoice.academyId !== body.academyId) {
    return NextResponse.json(
      { error: "INVOICE_MISMATCH", message: "La factura no pertenece a la academia especificada" },
      { status: 400 }
    );
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

    return NextResponse.json({
      success: true,
      invoice: updated,
    });
  } catch (error) {
    console.error("[billing/invoice/notes] Error updating invoice notes:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Error al actualizar las notas de la factura. Intenta de nuevo más tarde." },
      { status: 500 }
    );
  }
});
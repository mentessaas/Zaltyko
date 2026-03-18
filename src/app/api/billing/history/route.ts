import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
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

    return NextResponse.json(rows);
  } catch (error) {
    console.error("[billing/history] Error fetching invoices:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Error al obtener el historial de facturación. Intenta de nuevo más tarde." },
      { status: 500 }
    );
  }
});



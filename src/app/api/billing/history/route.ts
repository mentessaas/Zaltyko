import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { academies, billingInvoices } from "@/db/schema";
import { withTenant } from "@/lib/authz";

const BodySchema = z.object({
  academyId: z.string().uuid(),
  limit: z.number().min(1).max(50).optional(),
});

export const POST = withTenant(async (request, context) => {
  const body = BodySchema.parse(await request.json());

  const [academy] = await db
    .select({ tenantId: academies.tenantId })
    .from(academies)
    .where(eq(academies.id, body.academyId))
    .limit(1);

  if (!academy) {
    return NextResponse.json({ error: "ACADEMY_NOT_FOUND" }, { status: 404 });
  }

  const isAdmin = context.profile.role === "admin" || context.profile.role === "super_admin";
  if (!isAdmin && academy.tenantId !== context.tenantId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const limit = body.limit ?? 20;

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
      createdAt: billingInvoices.createdAt,
      stripeInvoiceId: billingInvoices.stripeInvoiceId,
    })
    .from(billingInvoices)
    .where(eq(billingInvoices.academyId, body.academyId))
    .orderBy(desc(billingInvoices.createdAt))
    .limit(limit);

  return NextResponse.json(rows);
});



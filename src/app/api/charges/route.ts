import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { academies, athletes, charges, billingItems, groups, chargeStatusEnum } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { verifyAcademyAccess } from "@/lib/permissions";
import { logEvent } from "@/lib/event-logging";

const CreateChargeSchema = z.object({
  academyId: z.string().uuid(),
  athleteId: z.string().uuid(),
  billingItemId: z.string().uuid().optional(),
  classId: z.string().uuid().optional().nullable(),
  label: z.string().min(1),
  amountCents: z.number().int().positive(),
  currency: z.string().default("EUR"),
  period: z.string().regex(/^\d{4}-\d{2}$/), // Format: YYYY-MM
  dueDate: z.string().optional(), // ISO date string
  notes: z.string().optional(),
  paymentMethod: z.enum(["cash", "transfer", "bizum", "card_manual", "other"]).optional(),
});

// Helper para validar y convertir números de forma segura
const safeNumberSchema = (fieldName: string, min?: number, max?: number) =>
  z
    .string()
    .optional()
    .transform((val) => {
      if (!val || val.trim() === "") return undefined;
      const num = Number(val);
      if (Number.isNaN(num)) {
        throw new z.ZodError([
          {
            code: "custom",
            path: [fieldName],
            message: `El valor de ${fieldName} debe ser un número válido`,
          },
        ]);
      }
      return num;
    })
    .pipe(
      z
        .number()
        .int()
        .refine((val) => min === undefined || val >= min, {
          message: `El valor de ${fieldName} debe ser mayor o igual a ${min}`,
        })
        .refine((val) => max === undefined || val <= max, {
          message: `El valor de ${fieldName} debe ser menor o igual a ${max}`,
        })
        .optional()
    );

const QuerySchema = z.object({
  academyId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  groupId: z.string().uuid().optional(),
  athleteId: z.string().uuid().optional(),
  status: z.string().optional(), // Allow comma-separated values like "pending,overdue"
  page: safeNumberSchema("page", 1).pipe(z.number().int().min(1).optional().default(1)),
  limit: safeNumberSchema("limit", 1, 200).pipe(z.number().int().min(1).max(200).optional().default(50)),
});

export const GET = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    let query;
    try {
      query = QuerySchema.parse(Object.fromEntries(url.searchParams));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            error: "VALIDATION_ERROR",
            message: "Parámetros de consulta inválidos",
            details: error.errors.map((e) => ({
              field: e.path.join("."),
              message: e.message,
            })),
          },
          { status: 400 }
        );
      }
      throw error;
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Verify academy access
    const academyAccess = await verifyAcademyAccess(query.academyId, context.tenantId);
    if (!academyAccess.allowed) {
      return NextResponse.json({ error: academyAccess.reason ?? "ACADEMY_ACCESS_DENIED" }, { status: 403 });
    }

    const conditions = [
      eq(charges.academyId, query.academyId),
      eq(charges.tenantId, context.tenantId),
    ];

    if (query.period) {
      conditions.push(eq(charges.period, query.period));
    }

    if (query.status) {
      // Soporte para filtro combinado: "pending,overdue" o estado único
      if (Array.isArray(query.status)) {
        conditions.push(inArray(charges.status, query.status));
      } else if (typeof query.status === "string" && query.status.includes(",")) {
        const statuses = query.status.split(",").map((s) => s.trim()).filter(Boolean) as Array<typeof chargeStatusEnum.enumValues[number]>;
        if (statuses.length > 0) {
          conditions.push(inArray(charges.status, statuses));
        }
      } else {
        conditions.push(eq(charges.status, query.status as typeof chargeStatusEnum.enumValues[number]));
      }
    }

    if (query.athleteId) {
      conditions.push(eq(charges.athleteId, query.athleteId));
    }

    // If groupId is provided, filter by athletes in that group
    let athleteIds: string[] | undefined;
    if (query.groupId) {
      const groupAthletes = await db
        .select({ athleteId: athletes.id })
        .from(athletes)
        .where(and(eq(athletes.groupId, query.groupId), eq(athletes.academyId, query.academyId)))
        .limit(1000); // Reasonable limit

      athleteIds = groupAthletes.map((a) => a.athleteId);
      if (athleteIds.length === 0) {
        return NextResponse.json({ items: [], total: 0, page: query.page, limit: query.limit });
      }
      conditions.push(inArray(charges.athleteId, athleteIds));
    }

    // Count total
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(charges)
      .where(and(...conditions));

    const total = Number(countResult?.count ?? 0);

    // Pagination
    const pageSize = Math.min(200, Math.max(1, query.limit));
    const offset = (query.page - 1) * pageSize;

    // Fetch charges with related data
    const items = await db
      .select({
        id: charges.id,
        academyId: charges.academyId,
        athleteId: charges.athleteId,
        athleteName: athletes.name,
        billingItemId: charges.billingItemId,
        billingItemName: billingItems.name,
        classId: charges.classId,
        label: charges.label,
        amountCents: charges.amountCents,
        currency: charges.currency,
        period: charges.period,
        dueDate: charges.dueDate,
        status: charges.status,
        paymentMethod: charges.paymentMethod,
        paidAt: charges.paidAt,
        notes: charges.notes,
        createdAt: charges.createdAt,
        updatedAt: charges.updatedAt,
        groupId: athletes.groupId,
        groupName: groups.name,
      })
      .from(charges)
      .innerJoin(athletes, eq(charges.athleteId, athletes.id))
      .leftJoin(billingItems, eq(charges.billingItemId, billingItems.id))
      .leftJoin(groups, eq(athletes.groupId, groups.id))
      .where(and(...conditions))
      .orderBy(desc(charges.createdAt), asc(charges.period))
      .limit(pageSize)
      .offset(offset);

    return NextResponse.json({
      items,
      total,
      page: query.page,
      limit: pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/charges", method: "GET" });
  }
});

export const POST = withTenant(async (request, context) => {
  try {
    const body = CreateChargeSchema.parse(await request.json());

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Verify academy access
    const academyAccess = await verifyAcademyAccess(body.academyId, context.tenantId);
    if (!academyAccess.allowed) {
      return NextResponse.json({ error: academyAccess.reason ?? "ACADEMY_ACCESS_DENIED" }, { status: 403 });
    }

    // Verify athlete belongs to academy
    const [athlete] = await db
      .select({ id: athletes.id })
      .from(athletes)
      .where(and(eq(athletes.id, body.athleteId), eq(athletes.academyId, body.academyId)))
      .limit(1);

    if (!athlete) {
      return NextResponse.json({ error: "ATHLETE_NOT_FOUND" }, { status: 404 });
    }

    // If billingItemId is provided, verify it exists and optionally auto-fill data
    let finalLabel = body.label;
    let finalAmountCents = body.amountCents;
    let finalCurrency = body.currency;

    if (body.billingItemId) {
      const [billingItem] = await db
        .select()
        .from(billingItems)
        .where(and(eq(billingItems.id, body.billingItemId), eq(billingItems.academyId, body.academyId)))
        .limit(1);

      if (!billingItem) {
        return NextResponse.json({ error: "BILLING_ITEM_NOT_FOUND" }, { status: 404 });
      }

      // Auto-fill if not provided
      if (!body.label || body.label === "") {
        finalLabel = `${billingItem.name} – ${body.period}`;
      }
      finalAmountCents = body.amountCents || billingItem.amountCents;
      finalCurrency = body.currency || billingItem.currency;
    }

    const [charge] = await db
      .insert(charges)
      .values({
        tenantId: context.tenantId,
        academyId: body.academyId,
        athleteId: body.athleteId,
        billingItemId: body.billingItemId ?? null,
        classId: body.classId ?? null,
        label: finalLabel,
        amountCents: finalAmountCents,
        currency: finalCurrency,
        period: body.period,
        dueDate: body.dueDate ? body.dueDate.split("T")[0] : null, // Convert to YYYY-MM-DD string
        status: "pending",
        paymentMethod: body.paymentMethod ?? null,
        notes: body.notes ?? null,
      })
      .returning();

    // Log event for Super Admin metrics
    await logEvent({
      academyId: body.academyId,
      eventType: "charge_created",
      metadata: {
        chargeId: charge.id,
        athleteId: body.athleteId,
        amountCents: finalAmountCents,
        period: body.period,
      },
    });

    return NextResponse.json({ charge }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/charges", method: "POST" });
  }
});


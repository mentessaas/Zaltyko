export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { federativeLicenses } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";

const createLicenseSchema = z.object({
  personId: z.string().uuid(),
  personType: z.enum(["athlete", "coach", "judge"]),
  licenseNumber: z.string().min(1),
  licenseType: z.string().min(1),
  federation: z.string().min(1),
  country: z.string().optional().default("ES"),
  validFrom: z.string(),
  validUntil: z.string(),
  medicalCertificateExpiry: z.string().optional(),
  status: z.enum(["active", "expired", "suspended", "pending"]).optional(),
  annualFeeCents: z.number().optional(),
  notes: z.string().optional(),
});

const querySchema = z.object({
  personId: z.string().uuid().optional(),
  personType: z.enum(["athlete", "coach", "judge"]).optional(),
  status: z.enum(["active", "expired", "suspended", "pending"]).optional(),
  expiringInDays: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).optional(),
  offset: z.string().transform(Number).pipe(z.number().min(0)).optional(),
});

export const GET = withTenant(async (request: Request, context: Record<string, unknown>) => {
  try {
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const params = querySchema.safeParse(search);

    if (!params.success) {
      return handleApiError(params.error);
    }

    const tenantId = context.tenantId as string;
    if (!tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    const conditions: SQL[] = [eq(federativeLicenses.tenantId, tenantId)];

    if (params.data.personId) {
      conditions.push(eq(federativeLicenses.personId, params.data.personId));
    }

    if (params.data.personType) {
      conditions.push(eq(federativeLicenses.personType, params.data.personType));
    }

    if (params.data.status) {
      conditions.push(eq(federativeLicenses.status, params.data.status));
    }

    const limit = params.data.limit ?? 50;
    const offset = params.data.offset ?? 0;

    const rows = await db
      .select({
        id: federativeLicenses.id,
        personId: federativeLicenses.personId,
        personType: federativeLicenses.personType,
        licenseNumber: federativeLicenses.licenseNumber,
        licenseType: federativeLicenses.licenseType,
        federation: federativeLicenses.federation,
        country: federativeLicenses.country,
        validFrom: federativeLicenses.validFrom,
        validUntil: federativeLicenses.validUntil,
        medicalCertificateExpiry: federativeLicenses.medicalCertificateExpiry,
        status: federativeLicenses.status,
        annualFeeCents: federativeLicenses.annualFeeCents,
        notes: federativeLicenses.notes,
        createdAt: federativeLicenses.createdAt,
      })
      .from(federativeLicenses)
      .where(and(...conditions))
      .orderBy(desc(federativeLicenses.validUntil))
      .limit(limit)
      .offset(offset);

    // Count total
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(federativeLicenses)
      .where(and(...conditions));

    const total = countResult[0]?.count ?? 0;

    // Count expiring soon (within 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const today = new Date().toISOString().split("T")[0];

    const expiringConditions: SQL[] = [
      eq(federativeLicenses.tenantId, tenantId),
      gte(federativeLicenses.validUntil, today),
      lte(federativeLicenses.validUntil, thirtyDaysFromNow.toISOString().split("T")[0]),
    ];

    const expiringCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(federativeLicenses)
      .where(and(...expiringConditions));

    return NextResponse.json({
      items: rows,
      total,
      expiringCount: expiringCountResult[0]?.count ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    return handleApiError(error);
  }
});

export const POST = withTenant(async (request: Request, context: Record<string, unknown>) => {
  try {
    const body = createLicenseSchema.parse(await request.json());

    const tenantId = context.tenantId as string;
    if (!tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    const [license] = await db
      .insert(federativeLicenses)
      .values({
        id: crypto.randomUUID(),
        tenantId,
        personId: body.personId,
        personType: body.personType,
        licenseNumber: body.licenseNumber,
        licenseType: body.licenseType,
        federation: body.federation,
        country: body.country ?? "ES",
        validFrom: body.validFrom,
        validUntil: body.validUntil,
        medicalCertificateExpiry: body.medicalCertificateExpiry ?? null,
        status: body.status ?? "active",
        annualFeeCents: body.annualFeeCents ?? null,
        notes: body.notes ?? null,
      })
      .returning();

    return NextResponse.json(license, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
});

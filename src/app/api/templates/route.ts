export const dynamic = 'force-dynamic';

import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { templates } from "@/db/schema/templates/templates";
import { withTenant } from "@/lib/authz";

const QuerySchema = z.object({
  countryCode: z.string().optional(),
  discipline: z.string().optional(),
  isActive: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});

export const GET = withTenant(async (request) => {
  try {
    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));

    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_FILTERS" }, { status: 400 });
    }

    const { countryCode, discipline, isActive } = parsed.data;

    const conditions = [];

    if (countryCode) {
      conditions.push(eq(templates.countryCode, countryCode));
    }

    if (discipline) {
      conditions.push(eq(templates.discipline, discipline));
    }

    if (isActive !== undefined) {
      conditions.push(eq(templates.isActive, isActive));
    }

    const whereClause = conditions.length > 0
      ? (conditions.length === 1 ? conditions[0] : and(...conditions))
      : undefined;

    const rows = await db
      .select({
        id: templates.id,
        country: templates.country,
        countryCode: templates.countryCode,
        discipline: templates.discipline,
        name: templates.name,
        description: templates.description,
        isActive: templates.isActive,
        isDefault: templates.isDefault,
      })
      .from(templates)
      .where(whereClause)
      .orderBy(templates.name);

    return NextResponse.json({ items: rows });
  } catch (error) {
    console.error("Error fetching templates:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Error fetching templates" },
      { status: 500 }
    );
  }
});

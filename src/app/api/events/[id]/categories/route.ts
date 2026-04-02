import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { events, eventCategories } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { apiSuccess } from "@/lib/api-response";

export const dynamic = 'force-dynamic';

export const GET = withTenant(async (_request, context) => {
  try {
    const { id: eventId } = context.params as { id: string };

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Verify event exists and belongs to tenant
    const [eventRow] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.tenantId, context.tenantId)))
      .limit(1);

    if (!eventRow) {
      return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
    }

    // Get categories for this event
    const categories = await db
      .select({
        id: eventCategories.id,
        name: eventCategories.name,
        description: eventCategories.description,
      })
      .from(eventCategories)
      .where(eq(eventCategories.eventId, eventId));

    return apiSuccess({ items: categories, total: categories.length });
  } catch (error) {
    return handleApiError(error);
  }
});

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
});

export const POST = withTenant(async (request, context) => {
  try {
    const { id: eventId } = context.params as { id: string };
    const body = createCategorySchema.parse(await request.json());

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Verify event exists and belongs to tenant
    const [eventRow] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.tenantId, context.tenantId)))
      .limit(1);

    if (!eventRow) {
      return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
    }

    const [category] = await db
      .insert(eventCategories)
      .values({
        id: crypto.randomUUID(),
        eventId,
        name: body.name,
        description: body.description ?? null,
      })
      .returning();

    return NextResponse.json({ ok: true, id: category.id }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
});

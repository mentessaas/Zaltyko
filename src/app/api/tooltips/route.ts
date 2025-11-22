import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { withTenant } from "@/lib/authz";

const markSchema = z.object({
  key: z.string().min(1),
});

export const GET = withTenant(async (_request, context) => {
  const [preferences] = await db
    .select({
      tooltipFlags: userPreferences.tooltipFlags,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, context.userId))
    .limit(1);

  return NextResponse.json({
    tooltipFlags: (preferences?.tooltipFlags ?? {}) as Record<string, boolean>,
  });
});

export const POST = withTenant(async (request, context) => {
  const parsed = markSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const existing = await db
    .select({
      tooltipFlags: userPreferences.tooltipFlags,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, context.userId))
    .limit(1);

  const currentFlags = (existing[0]?.tooltipFlags as Record<string, boolean> | null) ?? {};
  const updatedFlags = {
    ...currentFlags,
    [parsed.data.key]: true,
  };

  await db
    .insert(userPreferences)
    .values({
      userId: context.userId,
      tenantId: context.tenantId,
      tooltipFlags: updatedFlags,
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        tooltipFlags: updatedFlags,
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({ ok: true });
});


import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { classes } from "@/db/schema";
import { assertWithinPlanLimits } from "@/lib/limits";
import { withTenant } from "@/lib/authz";

const BodySchema = z.object({
  academyId: z.string().uuid(),
  name: z.string().min(1),
  weekday: z.number().int().min(0).max(6).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  capacity: z.number().int().positive().optional(),
});

export const POST = withTenant(async (request, context) => {
  const body = BodySchema.parse(await request.json());

  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  await assertWithinPlanLimits(context.tenantId, body.academyId, "classes");

  await db.insert(classes).values({
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    academyId: body.academyId,
    name: body.name,
    weekday: body.weekday ?? null,
    startTime: body.startTime ?? null,
    endTime: body.endTime ?? null,
    capacity: body.capacity ?? null,
  });

  return NextResponse.json({ ok: true });
});

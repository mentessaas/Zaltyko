import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { events } from "@/db/schema";
import { withTenant } from "@/lib/authz";

const BodySchema = z.object({
  academyId: z.string().uuid(),
  title: z.string().min(1),
  location: z.string().optional(),
  date: z.string().optional(),
  status: z.string().optional(),
});

export const POST = withTenant(async (request, context) => {
  const body = BodySchema.parse(await request.json());

  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  await db.insert(events).values({
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    academyId: body.academyId,
    title: body.title,
    location: body.location,
    date: body.date ? new Date(body.date) : null,
    status: body.status ?? undefined,
  });

  return NextResponse.json({ ok: true });
});

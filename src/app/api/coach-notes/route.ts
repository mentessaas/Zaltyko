import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athletes, coachNotes } from "@/db/schema";
import { withTenant } from "@/lib/authz";

const BodySchema = z.object({
  academyId: z.string().uuid(),
  athleteId: z.string().uuid(),
  note: z.string().min(1),
  authorId: z.string().uuid().optional(),
});

export const POST = withTenant(async (request, context) => {
  const body = BodySchema.parse(await request.json());

  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const [athlete] = await db
    .select({ id: athletes.id })
    .from(athletes)
    .where(
      and(
        eq(athletes.id, body.athleteId),
        eq(athletes.academyId, body.academyId),
        eq(athletes.tenantId, context.tenantId)
      )
    )
    .limit(1);

  if (!athlete) {
    return NextResponse.json({ error: "ATHLETE_NOT_FOUND" }, { status: 404 });
  }

  await db.insert(coachNotes).values({
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    academyId: body.academyId,
    athleteId: body.athleteId,
    authorId: body.authorId ?? context.profile.id,
    note: body.note,
  });

  return NextResponse.json({ ok: true });
});

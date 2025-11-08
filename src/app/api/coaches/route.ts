import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { coaches, memberships, profiles } from "@/db/schema";
import { withTenant } from "@/lib/authz";

const BodySchema = z.object({
  academyId: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  profileId: z.string().uuid().optional(),
});

export const POST = withTenant(async (request, context) => {
  const body = BodySchema.parse(await request.json());

  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const coachId = crypto.randomUUID();

  await db.insert(coaches).values({
    id: coachId,
    tenantId: context.tenantId,
    academyId: body.academyId,
    name: body.name,
    email: body.email,
    phone: body.phone,
  });

  if (body.profileId) {
    const [linkedProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, body.profileId))
      .limit(1);

    if (!linkedProfile) {
      return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
    }

    await db
      .insert(memberships)
      .values({
        id: crypto.randomUUID(),
        academyId: body.academyId,
        userId: linkedProfile.userId,
        role: "coach",
      })
      .onConflictDoNothing();
  }

  return NextResponse.json({ id: coachId });
});

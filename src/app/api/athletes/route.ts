import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { athletes, familyContacts } from "@/db/schema";
import { assertWithinPlanLimits } from "@/lib/limits";
import { withTenant } from "@/lib/authz";

const ContactSchema = z.object({
  name: z.string().min(1),
  relationship: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  notifyEmail: z.boolean().optional(),
  notifySms: z.boolean().optional(),
});

const BodySchema = z.object({
  academyId: z.string().uuid(),
  name: z.string().min(1),
  dob: z.string().optional(),
  level: z.string().optional(),
  contacts: z.array(ContactSchema).optional(),
});

export const POST = withTenant(async (request, context) => {
  const body = BodySchema.parse(await request.json());

  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  await assertWithinPlanLimits(context.tenantId, body.academyId, "athletes");

  const athleteId = crypto.randomUUID();

  await db.insert(athletes).values({
    id: athleteId,
    tenantId: context.tenantId,
    academyId: body.academyId,
    name: body.name,
    dob: body.dob ? new Date(body.dob) : null,
    level: body.level,
  });

  if (body.contacts?.length) {
    const rows = body.contacts.map((contact) => ({
      id: crypto.randomUUID(),
      tenantId: context.tenantId!,
      athleteId,
      name: contact.name,
      relationship: contact.relationship ?? null,
      email: contact.email ?? null,
      phone: contact.phone ?? null,
      notifyEmail: contact.notifyEmail ?? true,
      notifySms: contact.notifySms ?? false,
    }));

    await db.insert(familyContacts).values(rows).onConflictDoNothing();
  }

  return NextResponse.json({ ok: true, id: athleteId });
});

import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { sendClassReminders } from "@/lib/alerts/class-reminders";

const querySchema = z.object({
  academyId: z.string().uuid(),
  hoursBefore: z.string().optional(),
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const validated = querySchema.parse({
    academyId: body.academyId,
    hoursBefore: body.hoursBefore,
  });

  if (!validated.academyId) {
    return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
  }

  try {
    const hoursBefore = validated.hoursBefore ? parseInt(validated.hoursBefore) : 24;
    await sendClassReminders(validated.academyId, context.tenantId, hoursBefore);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error sending class reminders:", error);
    return NextResponse.json(
      { error: "REMINDERS_FAILED", message: error.message },
      { status: 500 }
    );
  }
});

